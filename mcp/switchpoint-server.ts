/**
 * @built F-154 Switchpoint MCP server — stdio transport over the real engine, sponsor gate and rule tables
 *
 * Run by Kiro from `.kiro/settings/mcp.json`; also runnable by hand:
 *   npx tsx mcp/switchpoint-server.ts
 *
 * Why it exists: the product rule is "the model never produces a number that reaches
 * the screen". While building, the same rule applies to the agent. Instead of
 * re-deriving a payback in prose, Kiro calls `compute_verdict` and gets the exact
 * result the UI would render, refusals included. `lookup_sponsor` answers the
 * municipal-light-plant question from the baked MassGIS table, so a Wellesley
 * address cannot be quoted a rebate by accident.
 *
 * Read-only. No network, no clock, no environment, no files written. stdout carries
 * only protocol frames; diagnostics go to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { computeVerdictTool, getFuelSnapshotTool, getProgramRuleTool, lookupSponsorTool, type ToolReply } from './tools'

const FUELS = ['oil', 'propane', 'gas', 'resistance'] as const
const TIERS = ['whole', 'partial', 'basic', 'enhanced'] as const

const heatingShape = z.object({
  fuel: z.enum(FUELS).describe('Current heating fuel.'),
  annualUnits: z.number().describe('Gallons (oil, propane), therms (gas) or kWh (resistance) per year.'),
  unitPrice: z.number().describe('USD per gallon, therm or kWh.'),
  afue: z.number().optional().describe('Efficiency as a fraction, 0.80 for a typical oil boiler.'),
  hdd65: z.number().optional().describe('Heating degree days, base 65 F. Boston is 5,600.'),
  designTempF: z.number().optional().describe('99% heating design temperature in F. Boston is 7.'),
  sqft: z.number().optional().describe('Heated floor area, used only for the envelope fallback.'),
})

const upgradeShape = z.object({
  tier: z.enum(TIERS).describe('Rebate tier being modelled.'),
  installYear: z.union([z.literal(2026), z.literal(2027)]).describe('Decides which rebate table pays.'),
  heatPumpRate: z.number().describe('Seasonal heat pump rate, USD per kWh.'),
  standardRate: z.number().describe('All-in standard residential rate, USD per kWh.'),
  tons: z.number().optional().describe('Cooling tons. Sized from the design load when absent.'),
  installCost: z.number().optional().describe('USD. Defaults to the Mass Save average, which is then listed as an assumption.'),
  weatherizationBonus: z.boolean().optional(),
  sizingBonus: z.boolean().optional(),
  scop: z.number().optional().describe('Seasonal COP. Defaults to 2.70.'),
})

/** Wrap a handler reply as MCP text content, flagging refusals as tool errors. */
function toContent(reply: ToolReply) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(reply.data, null, 2) }],
    isError: !reply.ok,
  }
}

const server = new McpServer({ name: 'switchpoint', version: '1.0.0' })

server.registerTool(
  'compute_verdict',
  {
    title: 'Compute a heat pump verdict',
    description:
      'Run the Switchpoint rules engine (lib/calc). Returns SWITCH_NOW, SWITCH_BEFORE_DEC31 or DO_NOT_SWITCH_YET with payback, rebate, break-even electricity price, reasons, caveats and every default used as an assumption. Hostile or incomplete inputs return a typed refusal, never a guess.',
    inputSchema: { heating: heatingShape, upgrade: upgradeShape },
  },
  async ({ heating, upgrade }) => toContent(computeVerdictTool(heating, upgrade)),
)

server.registerTool(
  'lookup_sponsor',
  {
    title: 'Look up the Mass Save sponsor for a town',
    description:
      'Resolve one of the 351 Massachusetts municipalities to its electric sponsor(s), whether Mass Save rebates apply (municipal light plant towns get none), and the seasonal-rate rule. Unknown or mixed towns return a question for the user instead of a guess.',
    inputSchema: { town: z.string().min(1).describe('Town name, any casing, e.g. "Wellesley".') },
  },
  async ({ town }) => toContent(lookupSponsorTool(town)),
)

server.registerTool(
  'get_program_rule',
  {
    title: 'Read a heat pump rebate rule',
    description:
      'Return one rebate tier for one install year (2026 or 2027) from data/rules/*.json: per-ton rate, caps, bonuses, eligible fuels, install window and documentation deadline, with the source line.',
    inputSchema: {
      year: z.union([z.literal(2026), z.literal(2027)]),
      tier: z.enum(TIERS),
    },
  },
  async ({ year, tier }) => toContent(getProgramRuleTool(year, tier)),
)

server.registerTool(
  'get_fuel_snapshot',
  {
    title: 'Read the dated DOER fuel price snapshot',
    description: 'Return the baked MA DOER fuel survey (oil and propane averages, 10th/90th percentile, year-ago) used when live prices are unavailable. Carries its own as-of date.',
    inputSchema: {},
  },
  async () => toContent(getFuelSnapshotTool()),
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('switchpoint MCP server ready on stdio')
