/**
 * @built F-80 sample bill templates: the HTML for oil/propane tickets, electric and gas bills
 * Shared by render.mjs (the fixture set) and scenarios.mjs (the scenario matrix).
 */

// ---- formatting -------------------------------------------------------------

export const usd = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const cents = (n) => Math.round(n * 100) / 100
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const longDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]} ${d}, ${y}`
}
export const shortDate = (iso) => {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y}`
}
export const addDays = (iso, days) => {
  const t = new Date(`${iso}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}
/** Month labels for a chart of `n` bars ending in the month of `endIso`. */
export const monthLabels = (endIso, n) => {
  const [y, m] = endIso.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const k = (y * 12 + (m - 1)) - (n - 1 - i)
    return `${MONTHS[k % 12]} ${String(Math.floor(k / 12)).slice(2)}`
  })
}

/**
 * Split a total into printed line items that add up to it exactly. The last line
 * absorbs the rounding, so the bill's arithmetic is always right.
 */
export function lineItems(total, lines) {
  const out = []
  let running = 0
  lines.forEach((line, i) => {
    const amount = i === lines.length - 1 ? cents(total - running) : cents(line.amount)
    running = cents(running + amount)
    out.push({ ...line, amount })
  })
  return out
}

// ---- shared chrome ------------------------------------------------------------

const BASE_CSS = `
  @page { size: 8.5in 11in; margin: 0 }
  * { box-sizing: border-box }
  html, body { margin: 0; background: #fff; color: #1b1f23 }
  body { font: 13px/1.4 "Helvetica Neue", Arial, sans-serif }
  .page { width: 816px; min-height: 1056px; padding: 44px 52px; position: relative; overflow: hidden }
  .wm { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none }
  .wm span { transform: rotate(-32deg); font: 700 46px/1 Arial, sans-serif; color: rgba(200, 30, 30, .15); white-space: nowrap; letter-spacing: 4px }
  .foot { position: absolute; left: 52px; right: 52px; bottom: 28px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 10.5px; color: #666 }
  h1 { font-size: 22px; margin: 0 }
  h2 { font-size: 13px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #333 }
  table { width: 100%; border-collapse: collapse }
  td, th { padding: 3px 6px; text-align: left; vertical-align: top }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #555; border-bottom: 1.5px solid #333 }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
  .rule td { border-top: 1px solid #ddd }
  .total td { border-top: 2px solid #222; font-weight: 700; font-size: 14px }
  .muted { color: #666 }
  .box { border: 1.5px solid #222; padding: 12px 14px }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px }
  .big { font-size: 26px; font-weight: 700 }
`

const watermark = '<div class="wm"><span>SAMPLE — NOT A REAL BILL</span></div><div style="position:absolute;top:14px;left:52px;right:52px;text-align:center;font:700 11px/1 Arial,sans-serif;letter-spacing:.12em;color:#c81e1e">SAMPLE FOR SOFTWARE TESTING — NOT A REAL BILL</div>'
const footer = (extra = '') =>
  `<div class="foot">SAMPLE DOCUMENT FOR SOFTWARE TESTING — NOT A REAL BILL. Synthetic numbers, fictional customer and account. ${extra}Switchpoint · Hackachusetts 2026</div>`

const shell = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${BASE_CSS}</style></head><body>${body}</body></html>`

// ---- templates -----------------------------------------------------------------

/** A Massachusetts heating-oil delivery ticket. */
export function oilTicket(b) {
  const total = cents(b.gallons * b.pricePerGal)
  const meterStart = 48213.6
  return shell(b.title, `<div class="page">${watermark}
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><h1>${b.dealer}</h1><div class="muted">${b.line ?? 'Home Heating Oil · Burner Service'} · ${b.dealerTown}, MA<br>MA Lic. No. 000-SAMPLE · (555) 010-0199</div></div>
      <div class="box" style="text-align:right"><div class="muted">DELIVERY TICKET</div><div class="big">No. ${b.ticketNo}</div></div>
    </div>
    <div class="grid2" style="margin-top:22px">
      <div class="box"><div class="muted">DELIVER TO</div><b>SAMPLE CUSTOMER</b><br>123 Sample St<br>${b.town}, MA ${b.zip}<br><span class="muted">Acct: 00-000000</span></div>
      <div class="box"><table>
        <tr><td>Delivery date</td><td class="num"><b>${shortDate(b.date)}</b></td></tr>
        <tr><td>Truck / Driver</td><td class="num">T-7 / 14</td></tr>
        <tr><td>Product</td><td class="num">${b.product ?? '#2 Heating Oil'}</td></tr>
        <tr><td>Tank size</td><td class="num">${b.tankGal} gal</td></tr>
        <tr><td>Fill type</td><td class="num">${b.degreeDays ? 'Automatic — fill' : 'Will-call — fill'}</td></tr>
      </table></div>
    </div>
    <h2>Meter</h2>
    <table>
      <tr><th>Meter start</th><th>Meter stop</th><th class="num">Gallons delivered</th></tr>
      <tr><td>${meterStart.toFixed(1)}</td><td>${(meterStart + b.gallons).toFixed(1)}</td><td class="num big">${b.gallons.toFixed(1)}</td></tr>
    </table>
    <h2>Charges</h2>
    <table>
      <tr><th>Description</th><th class="num">Gallons</th><th class="num">Price / gal</th><th class="num">Amount</th></tr>
      <tr><td>${b.product ?? '#2 Heating Oil'} — cash price</td><td class="num">${b.gallons.toFixed(1)}</td><td class="num">$${b.pricePerGal.toFixed(3)}</td><td class="num">${usd(total)}</td></tr>
      <tr class="rule"><td>Delivery fee</td><td></td><td></td><td class="num">${usd(0)}</td></tr>
      <tr class="total"><td>TOTAL DUE</td><td></td><td></td><td class="num">${usd(total)}</td></tr>
    </table>
    <div class="muted" style="margin-top:6px">Terms: ${b.terms}</div>
    ${b.degreeDays ? `<h2>Automatic delivery</h2><table>
      <tr><td>Degree days since last delivery (${shortDate(b.lastDelivery)})</td><td class="num"><b>${b.degreeDays.toLocaleString('en-US')}</b></td></tr>
      <tr><td>K-factor (degree days per gallon)</td><td class="num">${(b.degreeDays / b.gallons).toFixed(2)}</td></tr>
    </table>` : `<h2>Notes</h2><div class="muted">Will-call customer. Call 2–3 days before you need a delivery. 150 gal minimum.</div>`}
    <div style="margin-top:28px" class="muted">Received by: ______________________ &nbsp;&nbsp; Driver: #14 &nbsp;&nbsp; Thank you for your business.</div>
    ${footer('Fictional dealer. ')}
  </div>`)
}

/**
 * The "Monthly kWh Use" / "Monthly Therm Use" grid from page 2 of Eversource's
 * Eastern Massachusetts sample bills: month labels over values, two rows.
 */
function monthlyUseGrid(values, endIso, unit) {
  const labels = monthLabels(endIso, values.length)
  const half = Math.ceil(values.length / 2)
  const row = (from, to) => `<tr class="mh">${labels.slice(from, to).map((l) => `<td>${l}</td>`).join('')}</tr>
    <tr>${values.slice(from, to).map((v) => `<td>${v.toLocaleString('en-US')}</td>`).join('')}</tr>`
  return `<div class="band">Monthly ${unit} Use</div>
    <table class="grid">${row(0, half)}${row(half, values.length)}</table>`
}

/** Two-column bill page in the Eversource page-2 arrangement. */
const UTILITY_CSS = `
  .band { background: #1f7fd6; color: #fff; font-weight: 700; padding: 5px 8px; margin-top: 12px }
  .svc { background: #1f7fd6; color: #fff; padding: 8px 10px; font-weight: 700; line-height: 1.35 }
  .meter th { background: #bfe3ef; color: #123; font-size: 11px; text-transform: none; letter-spacing: 0; border: 1px solid #fff; text-align: center }
  .meter td { background: #8fd18a; text-align: center; font-weight: 700; border: 1px solid #fff }
  .grid td { text-align: center; padding: 2px 4px; border-bottom: 1px solid #ddd }
  .grid .mh td { background: #d9eef6; font-size: 11.5px }
  .cols { display: grid; grid-template-columns: 330px 1fr; gap: 22px; margin-top: 14px }
  .li td { padding: 2px 4px }
  .li td:nth-child(2) { text-align: right; white-space: nowrap; color: #333 }
  .li td:nth-child(3) { text-align: right; white-space: nowrap; width: 80px }
  .sub td { border-top: 1px solid #333; font-weight: 700 }
  .ind { padding-left: 16px !important }
`

/** Pro-rate `weights` over `amount` so the printed lines sum to it exactly. */
export const spread = (amount, weights) => {
  const sum = weights.reduce((s, w) => s + w.w, 0)
  return lineItems(amount, weights.map((w) => ({ ...w, amount: (amount * w.w) / sum })))
}

function summaryBlock(b, total, supply, deliveryTotal, supplyLabel, deliveryLabel) {
  const last = cents(total * 1.07)
  return `<table class="li">
      <tr><td>Amount Due On ${shortDate(addDays(b.date, -30))}</td><td></td><td>${usd(last)}</td></tr>
      <tr><td>Last Payment Received On ${shortDate(addDays(b.date, -12))}</td><td></td><td>-${usd(last)}</td></tr>
      <tr><td>Balance Forward</td><td></td><td>$0.00</td></tr>
      <tr><td>Current Charges/Credits</td><td></td><td></td></tr>
      <tr><td class="ind">${supplyLabel}</td><td></td><td>${usd(supply)}</td></tr>
      <tr><td class="ind">${deliveryLabel}</td><td></td><td>${usd(deliveryTotal)}</td></tr>
      <tr class="sub"><td>Total Current Charges</td><td></td><td>${usd(total)}</td></tr>
      <tr class="sub"><td>Total Amount Due</td><td></td><td>${usd(total)}</td></tr>
    </table>`
}

/**
 * An electric bill laid out like page 2 of Eversource's Eastern Massachusetts
 * sample bill (eversource.com › Understanding Your Electric Bill › Sample Electric
 * Bill, read 2026-10-24): service band, meter table, Monthly kWh Use grid,
 * payment summary, then "Total Charges for Electricity" — Supplier lines, then
 * Delivery lines in the sample's order. Rates are ours; the sample's are only
 * used as relative weights, and the total is always kWh × the fixture's all-in rate.
 */
export function electricBill(b) {
  const total = cents(b.kWh * b.allInRate)
  const supply = cents(b.kWh * b.supplyRate)
  const customer = 10.0
  const transition = cents(b.kWh * -0.00037)
  const assistance = b.assistance ? -cents(total * 0.18) : 0
  // Everything per-kWh on the delivery side, after the fixed and sign-carrying lines.
  const perKwh = cents(total - supply - customer - transition - assistance)
  // Weights are the Eversource EMA sample's own per-kWh rates; distribution carries 40%.
  const others = spread(cents(perKwh * 0.6), [
    { label: 'Transmission Charge', w: 0.04052 },
    { label: 'Net Meter Recovery Surcharge', w: 0.01622 },
    { label: 'Revenue Decoupling Charge', w: 0.00006 },
    { label: 'Distributed Solar Charge', w: 0.008 },
    { label: 'Renewable Energy Charge', w: 0.0005 },
    { label: 'Energy Efficiency Charge (CLC)', w: 0.04148 },
    { label: 'Electric Vehicle Program', w: 0.00138 },
  ])
  const distribution = cents(perKwh - others.reduce((s, l) => s + l.amount, 0))
  const deliveryTotal = cents(total - supply)
  const rate = (amount) => `${b.kWh.toLocaleString('en-US')} kWh X ${(amount / b.kWh).toFixed(5).replace(/^0/, '').replace(/^-0/, '-')}`
  const start = addDays(b.date, -b.days - 3)
  const end = addDays(b.date, -3)
  const prev = 98505
  const deliveryLines = [
    { label: 'Customer Charge', amount: customer, rate: '' },
    { label: 'Distribution Charge', amount: distribution, rate: rate(distribution) },
    { label: 'Transition Charge', amount: transition, rate: rate(transition) },
    ...others.map((l) => ({ ...l, rate: rate(l.amount) })),
    b.assistance && { label: 'Assistance Rate Discount', amount: assistance, rate: '' },
  ].filter(Boolean)
  const money = (n) => (n < 0 ? `-${usd(-n)}` : usd(n))
  return shell(b.title, `<style>${UTILITY_CSS}</style><div class="page">${watermark}
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><h1>${b.utility}</h1><div class="muted">Account Number 0000 000 0000 · Statement Date ${shortDate(b.date)}</div></div>
      <div class="muted" style="text-align:right">Service Provided To:<br><b style="color:#222">SAMPLE CUSTOMER</b></div>
    </div>
    <div class="cols">
      <div>
        <div class="svc">Svc Addr: 123 Sample St<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${b.town}, MA ${b.zip}<br>
          Rate ${b.rateLabel} &nbsp; Cycle 12<br>Service from ${shortDate(start)} - ${shortDate(end)} &nbsp; ${b.days} Days<br>
          Next read date on or about: ${shortDate(addDays(end, 30))}</div>
        <table class="meter">
          <tr><th>Meter Number</th><th>Current Read</th><th>Previous Read</th><th>Current Usage</th><th>Reading Type</th></tr>
          <tr><td>000000000</td><td>${prev + b.kWh}</td><td>${prev}</td><td>${b.kWh}</td><td>Actual</td></tr>
        </table>
        <div class="muted" style="font-size:11px">Service Reference: 00000000</div>
        ${b.history ? monthlyUseGrid(b.history, b.date, 'kWh') : ''}
        <h2>Contact Information</h2>
        <div class="muted">Customer Service: (555) 010-0100<br>Emergency: (555) 010-0111</div>
        ${b.supplierContact ? `<h2>Your electric supplier is</h2><div class="muted">${b.supplierContact}</div>` : ''}
      </div>
      <div>
        ${summaryBlock(b, total, supply, deliveryTotal, 'Electric Supply Services', 'Delivery Services')}
        <div class="band" style="margin-top:14px">Total Charges for Electricity</div>
        <table class="li">
          <tr><td><b>Supplier</b> ${b.supplier}</td><td></td><td></td></tr>
          <tr><td>Meter 0000000</td><td></td><td></td></tr>
          <tr><td>Generation Service Charge</td><td>${b.kWh.toLocaleString('en-US')} kWh X ${b.supplyRate.toFixed(5).replace(/^0/, '')}</td><td>${usd(supply)}</td></tr>
          <tr class="sub"><td>Subtotal Supplier Services</td><td></td><td>${usd(supply)}</td></tr>
          ${b.supplyNote ? `<tr><td colspan="3" class="muted" style="font-size:11.5px">${b.supplyNote}</td></tr>` : ''}
          <tr><td style="padding-top:10px"><b>Delivery</b></td><td></td><td></td></tr>
          <tr><td><b>${b.rateLabel}</b></td><td></td><td></td></tr>
          <tr><td>Meter 0000000</td><td></td><td></td></tr>
          ${deliveryLines.map((l) => `<tr><td>${l.label}</td><td>${l.rate}</td><td>${money(l.amount)}</td></tr>`).join('')}
          <tr class="sub"><td>Subtotal Delivery Services</td><td></td><td>${usd(deliveryTotal)}</td></tr>
          <tr class="sub"><td>Total Current Charges</td><td></td><td>${usd(total)}</td></tr>
        </table>
      </div>
    </div>
    ${footer(b.supplier.includes('fictional') ? 'Fictional supplier. ' : '')}
  </div>`)
}

/**
 * A gas bill in the arrangement of Eversource's Massachusetts sample gas bill
 * (read 2026-10-24): meter table, then "Total Charges for Gas" in its three
 * categories — Supply, Maintenance and Infrastructure Investment, Public Benefits.
 * Public Benefits lines are the ones the MA Attorney General's office lists
 * (energy efficiency, residential assistance, geothermal; via NCLC 2026-02).
 */
export function gasBill(b) {
  const total = cents(b.therms * b.allInRate)
  const supply = cents(b.therms * b.supplyRate)
  const customer = 10.5
  const assistance = b.assistance ? -cents(total * 0.18) : 0
  const rest = cents(total - supply - customer - assistance)
  const infra = spread(cents(rest * 0.7), [
    { label: 'Delivery Charge', w: 0.8 },
    { label: 'Local Distribution Adjustment', w: 0.2 },
  ])
  const benefits = spread(cents(rest - infra.reduce((s, l) => s + l.amount, 0)), [
    { label: 'Energy Efficiency Charge', w: 0.7 },
    { label: 'Residential Assistance Charge', w: 0.25 },
    { label: 'Geothermal Charge', w: 0.05 },
  ])
  const rate = (amount) => `${b.therms} Therms X ${(amount / b.therms).toFixed(4)}`
  const start = addDays(b.date, -b.days - 3)
  const end = addDays(b.date, -3)
  const ccf = Math.round(b.therms / 1.0378)
  const prev = 7310
  return shell(b.title, `<style>${UTILITY_CSS}</style><div class="page">${watermark}
    <div style="display:flex;justify-content:space-between;align-items:flex-end">
      <div><h1>${b.utility}</h1><div class="muted">Account Number 0000 000 0000 · Statement Date ${shortDate(b.date)}</div></div>
      <div class="muted" style="text-align:right">Service Provided To:<br><b style="color:#222">SAMPLE CUSTOMER</b></div>
    </div>
    <div class="cols">
      <div>
        <div class="svc">Svc Addr: 123 Sample St<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${b.town}, MA ${b.zip}<br>
          Rate ${b.rateLabel ?? 'R-3 Residential Heating'}<br>Service from ${shortDate(start)} - ${shortDate(end)} &nbsp; ${b.days} Days</div>
        <table class="meter">
          <tr><th>Meter Number</th><th>Current Read</th><th>Previous Read</th><th>CCF Used</th><th>Therm Factor</th><th>Therms</th></tr>
          <tr><td>000000</td><td>${prev + ccf}</td><td>${prev}</td><td>${ccf}</td><td>1.0378</td><td>${b.therms}</td></tr>
        </table>
        <h2>Contact Information</h2>
        <div class="muted">Customer Service: (555) 010-0100<br>Gas Emergency: (555) 010-0122</div>
        <h2>Your gas supplier is</h2><div class="muted">${b.utility}</div>
      </div>
      <div>
        ${summaryBlock(b, total, supply, cents(total - supply), 'Supply', 'Maintenance, Infrastructure &amp; Public Benefits')}
        <div class="band" style="margin-top:14px">Total Charges for Gas</div>
        <table class="li">
          <tr><td><b>Supply</b></td><td></td><td></td></tr>
          <tr><td>Gas Supply Charge</td><td>${b.therms} Therms X ${b.supplyRate.toFixed(4)}</td><td>${usd(supply)}</td></tr>
          <tr class="sub"><td>Subtotal Supply</td><td></td><td>${usd(supply)}</td></tr>
          <tr><td style="padding-top:10px"><b>Maintenance and Infrastructure Investment</b></td><td></td><td></td></tr>
          <tr><td>Customer Charge</td><td></td><td>${usd(customer)}</td></tr>
          ${infra.map((l) => `<tr><td>${l.label}</td><td>${rate(l.amount)}</td><td>${usd(l.amount)}</td></tr>`).join('')}
          <tr><td style="padding-top:10px"><b>Public Benefits</b></td><td></td><td></td></tr>
          ${benefits.map((l) => `<tr><td>${l.label}</td><td>${rate(l.amount)}</td><td>${usd(l.amount)}</td></tr>`).join('')}
          ${b.assistance ? `<tr><td>Assistance Rate Discount</td><td></td><td>-${usd(-assistance)}</td></tr>` : ''}
          <tr class="sub"><td>Total Current Charges</td><td></td><td>${usd(total)}</td></tr>
        </table>
      </div>
    </div>
    ${footer()}
  </div>`)
}
/** Something that is not an energy bill at all. */
export function cafeReceipt(b) {
  return shell(b.title, `<div class="page" style="display:grid;place-items:start center">${watermark}
    <div style="width:340px;margin-top:60px;font:14px/1.5 'Courier New',monospace;border:1px dashed #999;padding:22px">
      <div style="text-align:center"><b>THE SAMPLE BEAN CAFE</b><br>12 Example Sq · Wellesley MA<br>(555) 010-0144</div><br>
      10/24/2026 08:12 &nbsp; Order #4471<br>--------------------------------<br>
      2  Oat latte, large ......... 13.50<br>1  Blueberry muffin ......... 4.25<br>1  Breakfast sandwich ....... 8.95<br>
      --------------------------------<br>Subtotal ................. 26.70<br>MA meals tax 7% ........... 1.87<br>
      <b>TOTAL .................... 28.57</b><br>VISA ************0000<br><br><div style="text-align:center">Thank you — come back soon</div>
    </div>
    ${footer('Fictional cafe. ')}
  </div>`)
}

/** Wrap another document's HTML as if photographed on a kitchen table. */
export function phonePhoto(innerFile, title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>
    html, body { margin: 0; width: 1080px; height: 1440px; overflow: hidden;
      background: radial-gradient(ellipse at 30% 20%, #b08a62, #6e4f33 70%, #4a3322) }
    .paper { position: absolute; left: 92px; top: 150px; width: 816px; height: 1056px; border: 0;
      transform: perspective(1600px) rotateX(7deg) rotateZ(-3.2deg) scale(1.02);
      box-shadow: 18px 26px 40px rgba(0,0,0,.45); filter: blur(.55px) brightness(.93) contrast(.95) }
    .glare { position: absolute; inset: 0; background: linear-gradient(115deg, rgba(255,255,255,0) 40%, rgba(255,255,240,.18) 52%, rgba(255,255,255,0) 64%) }
  </style></head><body><iframe class="paper" src="${innerFile}" scrolling="no"></iframe><div class="glare"></div></body></html>`
}

