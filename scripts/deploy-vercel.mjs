/**
 * Deploy weba na Vercel REST-om (v13/deployments, inline base64 datoteke).
 *
 * Zasto ne CLI: VERCEL_TOKEN je project-scoped (vcp_) i CLI ga odbija.
 * Zamke ugradjene u postavke (naucene 2026-08-26):
 * - rootDirectory MORA biti null (file-upload + rootDirectory rezu stablo)
 * - build cache lomi pnpm workspace symlinke (env VERCEL_FORCE_NO_BUILD_CACHE=1
 *   stoji na projektu)
 * - apps/mobile se NE salje (Expo ne ide na Vercel; package.json ostaje
 *   zbog pnpm lockfile konzistencije)
 *
 * Pokretanje: node scripts/deploy-vercel.mjs   (VERCEL_TOKEN iz .env.local)
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const TEAM = 'team_CurGr1d6em0uYFqqrvmEdIY5';
const PROJECT = 'prj_K9kHgwShYBRiMj2UHpj7yp0gGJkx';

function loadToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  if (existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8')
      .split('\n')
      .find((l) => l.startsWith('VERCEL_TOKEN='));
    if (line) return line.slice('VERCEL_TOKEN='.length).trim();
  }
  throw new Error('VERCEL_TOKEN nije postavljen');
}

const token = loadToken();

const tracked = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.startsWith('apps/mobile/') || f === 'apps/mobile/package.json');

const files = tracked.map((file) => ({
  file,
  data: readFileSync(file).toString('base64'),
  encoding: 'base64',
}));

console.log(`Saljem ${files.length} datoteka…`);

const res = await fetch(
  `https://api.vercel.com/v13/deployments?teamId=${TEAM}&skipAutoDetectionConfirmation=1`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'wagen',
      project: PROJECT,
      target: 'production',
      files,
      projectSettings: {
        framework: 'nextjs',
        rootDirectory: null,
        installCommand: 'npx -y pnpm@11.22.0 install --frozen-lockfile',
        buildCommand: 'pnpm --filter @wagen/web build',
        outputDirectory: 'apps/web/.next',
      },
    }),
  },
);
const deployment = await res.json();
if (!res.ok) {
  console.error('Deploy odbijen:', JSON.stringify(deployment).slice(0, 500));
  process.exit(1);
}
console.log('Deployment:', deployment.id, deployment.url);

// Cekaj ishod
for (;;) {
  await new Promise((r) => setTimeout(r, 10000));
  const s = await fetch(`https://api.vercel.com/v13/deployments/${deployment.id}?teamId=${TEAM}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  console.log('status:', s.readyState);
  if (s.readyState === 'READY') break;
  if (s.readyState === 'ERROR' || s.readyState === 'CANCELED') {
    console.error('Deploy pao — vidi https://vercel.com dashboard.');
    process.exit(1);
  }
}
console.log('READY — https://wagen.hr');
