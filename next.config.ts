import type { NextConfig } from 'next'

/**
 * @built F-01 Next.js configuration — no secrets, no rewrites, deploy-anywhere
 *
 * Everything the app needs at runtime is either a public route or an optional
 * server key. There is nothing to configure before a deploy, which is the point
 * at 12:00 on hackathon day.
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },
  async redirects() {
    return [{ source: '/start', destination: '/onboarding', permanent: false }]
  },
  // Bill images are parsed in memory. Nothing is written, so nothing is stored.
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig
