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
    'Point Switchpoint at a Massachusetts address and a heating bill. It answers one question: switch to a heat pump, switch before 31 December, or leave it alone — with the arithmetic, the sources and the dates.',
  applicationName: 'Switchpoint',
  openGraph: {
    type: 'website',
    siteName: 'Switchpoint',
    title: 'The honest heat pump verdict for Massachusetts',
    description:
      'Three in ten Massachusetts homes heat with oil. Switchpoint says whether a heat pump pays for this house — and says no when it does not.',
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
