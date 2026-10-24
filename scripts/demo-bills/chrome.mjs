/**
 * @built F-80 headless Chrome helpers shared by the bill renderers and the scenario report
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

export const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const chromeAvailable = () => existsSync(CHROME)

export function chrome(args) {
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--allow-file-access-from-files', ...args], { stdio: 'ignore' })
}

/** One bill page to a PNG and a PDF, the way the fixture set renders them. */
export function renderBillFiles(htmlPath, pngPath, pdfPath) {
  chrome(['--window-size=816,1056', '--force-device-scale-factor=1.5', `--screenshot=${pngPath}`, `file://${htmlPath}`])
  chrome(['--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`])
}
