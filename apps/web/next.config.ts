import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Paketi iz monorepa koje Next mora transpilirati dodaju se ovdje
  // kad nastanu (@wagen/domain, @wagen/supabase).
  transpilePackages: [],
};

export default nextConfig;
