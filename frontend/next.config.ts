import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export capabilities
  output: 'standalone',

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '8000',
      },
      {
        protocol: 'https',
        hostname: process.env.NEXT_PUBLIC_APP_DOMAIN || 'localhost',
      },
      {
        protocol: 'http',
        hostname: 'backend',
        port: '8000',
      }
    ],
    unoptimized: true,
  },

  // Headers for service worker scope
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },

  // Proxy API calls to Django backend.
  // In Docker, the Next.js server can reach the backend container via 'http://backend:8000'
  async rewrites() {
    const isProd = process.env.NODE_ENV === 'production';
    const backendUrl = process.env.BACKEND_INTERNAL_URL || (isProd ? 'http://backend:8000' : 'http://localhost:8000');
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
