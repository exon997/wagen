import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

// .env.local zivi u ROOTU monorepa (jedan izvor za web, mobile i worker).
// Next bi ga trazio u apps/web - ucitaj rucno, bez gazenja vec postavljenih.
const rootEnvPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(rootEnvPath)) {
  for (const line of fs.readFileSync(rootEnvPath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)="?([^"]*)"?\s*$/.exec(line.trim());
    if (match && match[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@wagen/domain', '@wagen/supabase'],
};

export default nextConfig;
