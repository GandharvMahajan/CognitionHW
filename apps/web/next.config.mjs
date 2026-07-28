/** @type {import('next').NextConfig} */
const apiUrl = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fintech/ui', '@fintech/domain'],
  webpack(config) {
    // Workspace packages are consumed as TypeScript source and use ESM-style ".js" specifiers.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
  async rewrites() {
    // The browser always talks to the console origin; Next proxies commands to the API
    // so session cookies stay first-party and the API is never exposed directly.
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
