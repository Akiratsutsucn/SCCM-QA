import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['sharp', 'pg', '@electric-sql/pglite'],
  experimental: {
    serverActions: { bodySizeLimit: '6mb' },
  },
  // 操作端只有首页一页；旧路径一律回首页（查询参数原样保留）
  async redirects() {
    return [
      { source: '/search', destination: '/', permanent: false },
      { source: '/gallery', destination: '/', permanent: false },
      { source: '/guide/:path*', destination: '/', permanent: false },
      { source: '/feedback', destination: '/', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // 搜索词在 URL 中，跨站时不带出完整地址
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
