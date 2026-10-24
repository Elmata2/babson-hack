import type { NextConfig } from 'next'

/**
 * @built F-01 Next.js configuration — no secrets, no rewrites, deploy-anywhere
 *
 * Everything the app needs at runtime is either a public route or an optional
 * server key. There is nothing to configure before a deploy, which is the point
 * at 12:00 on hackathon day.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [{ source: '/start', destination: '/onboarding', permanent: false }]
  },
  // Bill images are parsed in memory. Nothing is written, so nothing is stored.
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig
