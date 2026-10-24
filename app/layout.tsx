import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'

import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://switchpoint-psi.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Switchpoint — the honest heat pump verdict for Massachusetts',
    template: '%s · Switchpoint',
  },
  description:
    'Two bills, two minutes, one answer for your house: switch now, switch before 31 December, or leave it alone. Heat pump, heating fuel and electricity supply maths for Massachusetts, with the source and the date on every figure.',
  applicationName: 'Switchpoint',
  openGraph: {
    type: 'website',
    siteName: 'Switchpoint',
    title: 'Should you switch? Two bills will tell you',
    description:
      '624,510 Massachusetts households heat with oil, and the whole-home rebate drops on 1 January. Switchpoint says what your house should do — and says no when a heat pump does not pay.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#fbfaf7',
  colorScheme: 'light',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-US" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-pill focus:bg-ink focus:px-4 focus:py-2 focus:text-small focus:text-paper"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
