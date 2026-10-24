import contactsJson from '../../data/rules/contacts-2026.json'
import type { Fuel } from '../calc/types'
import type { BillUtility } from '../parse/contract'
import type { SponsorKey } from '../utility'

export interface Contact {
  id: string
  org: string
  purpose: string
  phone?: string
  url: string
  source: string
  readOn: string
}

export type ContactId =
  | 'masssave-assessment'
  | 'masssave-installers'
  | 'masssave-heat-pump-line'
  | 'masssave-heat-loan'
  | 'masssave-income-eligible'
  | 'energy-switch-ma'
  | 'eversource'
  | 'national-grid'
  | 'unitil'
  | 'cape-light-compact'

export type ContactUtility = 'eversource' | 'nationalgrid' | 'unitil' | 'municipal'

const CONTACTS = contactsJson.contacts as readonly Contact[]

const UTILITY_CONTACT: Record<Exclude<ContactUtility, 'municipal'>, ContactId> = {
  eversource: 'eversource',
  nationalgrid: 'national-grid',
  unitil: 'unitil',
}

const UTILITY_NAME: Record<ContactUtility, string> = {
  eversource: 'Eversource',
  nationalgrid: 'National Grid',
  unitil: 'Unitil',
  municipal: 'your municipal light plant',
}

const FUEL_NAME: Record<Fuel, string> = {
  oil: 'Oil',
  propane: 'Propane',
  gas: 'Gas',
  resistance: 'Electric resistance',
}

export interface ContactsInput {
  fuel: Fuel
  dealer: string | null
  utility: ContactUtility | null
  capeLight: boolean
  recommendation: 'switch' | 'stay'
  supplyShoppable: boolean
}

export interface ContactLink {
  label: string
  href: string
}

export interface ContactItem {
  title: string
  detail: string | null
  phone: { display: string; href: string } | null
  links: ContactLink[]
  sources: { text: string; readOn: string }[]
}

export interface ContactsBlock {
  now: string
  items: ContactItem[]
}

function contact(id: ContactId): Contact {
  const found = CONTACTS.find((entry) => entry.id === id)
  if (!found) throw new Error(`contact ${id} missing from data/rules/contacts-2026.json`)
  return found
}

function plain(title: string, detail: string): ContactItem {
  return { title, detail, phone: null, links: [], sources: [] }
}

function item(
  title: string,
  detail: string | null,
  ids: { phone?: ContactId; links: { id: ContactId; label: string }[] },
): ContactItem {
  const phoneEntry = ids.phone ? contact(ids.phone) : null
  const linked = ids.links.map((link) => ({ entry: contact(link.id), label: link.label }))
  const seen = new Set<string>()
  const sources = [...(phoneEntry ? [phoneEntry] : []), ...linked.map((link) => link.entry)]
    .filter((entry) => !seen.has(entry.id) && seen.add(entry.id))
    .map((entry) => ({ text: entry.source, readOn: entry.readOn }))
  return {
    title,
    detail,
    phone: phoneEntry?.phone
      ? { display: phoneEntry.phone, href: `tel:+1${phoneEntry.phone.replace(/\D/g, '')}` }
      : null,
    links: linked.map((link) => ({ label: link.label, href: link.entry.url })),
    sources,
  }
}

function nowLine(input: ContactsInput): string {
  const dealer = input.dealer ? `, from ${input.dealer}` : ''
  const delivered = input.utility
    ? `electricity delivered by ${UTILITY_NAME[input.utility]}`
    : 'electricity utility not confirmed yet'
  const efficiency = input.capeLight ? '; efficiency programs by Cape Light Compact' : ''
  return `Now: ${FUEL_NAME[input.fuel]} heating${dealer}; ${delivered}${efficiency}.`
}

function switchItems(): ContactItem[] {
  return [
    item(
      'Book a no-cost Home Energy Assessment',
      'This is how a heat pump plan starts. An assessor checks the house and lists the rebates you qualify for.',
      { phone: 'masssave-assessment', links: [{ id: 'masssave-assessment', label: 'Book online' }] },
    ),
    item(
      'Get installer quotes',
      'Only installers in the Mass Save network qualify you for the rebate. Ask for two or three written quotes.',
      { links: [{ id: 'masssave-installers', label: 'Find a Mass Save installer' }] },
    ),
    item('Questions about heat pump rebates', null, {
      phone: 'masssave-heat-pump-line',
      links: [{ id: 'masssave-heat-pump-line', label: 'Heat pump rebates' }],
    }),
    item('Finance it', 'A HEAT Loan covers the part the rebate does not.', {
      links: [{ id: 'masssave-heat-loan', label: 'HEAT Loan details' }],
    }),
    item('Income verification for enhanced offers', 'If your household may be income-eligible, higher rebates apply.', {
      phone: 'masssave-income-eligible',
      links: [{ id: 'masssave-income-eligible', label: 'Income-based offers' }],
    }),
  ]
}

function stayItems(input: ContactsInput): ContactItem[] {
  const items: ContactItem[] = []
  if (input.utility === 'municipal') {
    items.push(
      plain(
        'Contact your municipal light plant',
        'Mass Save rebates do not apply to light plant customers. Ask the light plant which efficiency or heat pump programs it runs. Its number is on your electric bill.',
      ),
    )
  } else if (input.utility) {
    const id = UTILITY_CONTACT[input.utility]
    items.push(
      item(`Ask ${UTILITY_NAME[input.utility]} about your bill`, 'Rate plans and the winter heat pump rate are set by your utility.', {
        phone: contact(id).phone ? id : undefined,
        links: [{ id, label: 'Contact page' }],
      }),
    )
  }
  if (input.capeLight) {
    items.push(
      item('Cape Light Compact general questions', 'Efficiency programs and supply options run through the Compact.', {
        phone: 'cape-light-compact',
        links: [{ id: 'cape-light-compact', label: 'Cape Light Compact' }],
      }),
    )
  }
  if (!input.utility) {
    items.push(plain("Check your electric bill for your utility's customer service number", 'We could not tell which utility serves this address from the town alone.'))
  }
  if (input.supplyShoppable) {
    items.push(
      item('Compare electricity supply', 'Delivery stays with your utility. Supply is the part you can shop.', {
        links: [{ id: 'energy-switch-ma', label: 'Energy Switch Massachusetts' }],
      }),
    )
  }
  if (input.fuel === 'oil' || input.fuel === 'propane') {
    items.push(plain(`Ask ${input.dealer ?? 'your dealer'} for a price`, "Ask for today's price per gallon in writing before your next delivery."))
  }
  return items
}

export function contactsBlock(input: ContactsInput): ContactsBlock {
  return {
    now: nowLine(input),
    items: input.recommendation === 'switch' ? switchItems() : stayItems(input),
  }
}

const BILL_UTILITY: Partial<Record<BillUtility, ContactUtility>> = {
  eversource: 'eversource',
  national_grid: 'nationalgrid',
  unitil: 'unitil',
  municipal: 'municipal',
}

export function contactUtilityFor(billUtility: BillUtility | null, sponsors: readonly SponsorKey[]): ContactUtility | null {
  const fromBill = billUtility ? BILL_UTILITY[billUtility] : undefined
  if (fromBill) return fromBill
  const listed = sponsors.map((sponsor) => (sponsor === 'cape_light' ? 'eversource' : sponsor)).filter((sponsor): sponsor is ContactUtility => sponsor !== 'other')
  const distinct = [...new Set(listed)]
  return distinct.length === 1 ? distinct[0]! : null
}

export function isCapeLightTown(sponsors: readonly SponsorKey[]): boolean {
  return sponsors.includes('cape_light')
}
