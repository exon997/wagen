/**
 * I2 (eksperimentalna zamjena pozadine, 4.4): programski render "wagen sobe"
 * iz 4 kuta vodjenog fotografiranja. 3D geometrija -> perspektivna projekcija
 * -> SVG poligoni -> sharp -> JPG. Bez AI-ja: deterministicki, konzistentno,
 * s wagen potpisom (suptilna cyan LED linija).
 *
 * Pokretanje: node scripts/render-backgrounds.mjs [izlazni-dir]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT =
  process.argv[2] ??
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'apps',
    'mobile',
    'assets',
    'backgrounds',
  );
const W = 2400;
const H = 1800; // 4:3 kao nase fotke

// Soba: 14m siroka (x), 9m duboka (z), 3.4m visoka (y). Ishodiste: sredina poda.
const ROOM = { w: 14, d: 9, h: 3.4 };
const TILE = 1.15;

// --- mini 3D -> 2D ---------------------------------------------------------
function camera(pos, target, fovDeg) {
  const f = H / 2 / Math.tan((fovDeg * Math.PI) / 180 / 2);
  const fw = norm(sub(target, pos)); // forward
  const rt = norm(cross(fw, [0, 1, 0]));
  const up = cross(rt, fw);
  return { pos, fw, rt, up, f };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

function project(cam, p) {
  const rel = sub(p, cam.pos);
  const z = dot(rel, cam.fw);
  if (z <= 0.05) return null; // iza kamere
  const x = dot(rel, cam.rt);
  const y = dot(rel, cam.up);
  return [W / 2 + (x * cam.f) / z, H / 2 - (y * cam.f) / z];
}

function poly(cam, points, fill, extra = '') {
  const projected = points.map((p) => project(cam, p));
  if (projected.some((p) => p === null)) return '';
  const d = projected.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return `<polygon points="${d}" fill="${fill}" ${extra}/>`;
}

// --- scena -----------------------------------------------------------------
function renderScene(cam) {
  const { w, d, h } = ROOM;
  const x0 = -w / 2,
    x1 = w / 2,
    z0 = 0,
    z1 = d;
  let svg = '';

  // Pozadinski gradienti (zid svjetliji gore, blagi pad prema podu)
  svg += `<defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f2f2f0"/>
      <stop offset="78%" stop-color="#e4e4e2"/>
      <stop offset="100%" stop-color="#cfcfcd"/>
    </linearGradient>
    <linearGradient id="wallL" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#eaeae8"/>
      <stop offset="100%" stop-color="#c6c6c4"/>
    </linearGradient>
    <linearGradient id="wallR" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ececea"/>
      <stop offset="100%" stop-color="#c9c9c7"/>
    </linearGradient>
    <linearGradient id="ceil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fbfbfa"/>
      <stop offset="100%" stop-color="#eeeeec"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#dff9fb" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#dff9fb" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="50%" cy="42%" r="75%">
      <stop offset="62%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.14"/>
    </radialGradient>
  </defs>`;

  // Strop, zidovi (redoslijed: daleko -> blizu)
  svg += poly(
    cam,
    [
      [x0, h, z1],
      [x1, h, z1],
      [x1, h, z0],
      [x0, h, z0],
    ],
    'url(#ceil)',
  );
  svg += poly(
    cam,
    [
      [x0, 0, z1],
      [x1, 0, z1],
      [x1, h, z1],
      [x0, h, z1],
    ],
    'url(#wall)',
  );
  svg += poly(
    cam,
    [
      [x0, 0, z0],
      [x0, 0, z1],
      [x0, h, z1],
      [x0, h, z0],
    ],
    'url(#wallL)',
  );
  svg += poly(
    cam,
    [
      [x1, 0, z1],
      [x1, 0, z0],
      [x1, h, z0],
      [x1, h, z1],
    ],
    'url(#wallR)',
  );

  // wagen potpis: tanka cyan LED linija na straznjem zidu (h*0.62), preko cijele sirine
  const ly = h * 0.62;
  svg += poly(
    cam,
    [
      [x0 + 0.6, ly - 0.025, z1 - 0.01],
      [x1 - 0.6, ly - 0.025, z1 - 0.01],
      [x1 - 0.6, ly + 0.025, z1 - 0.01],
      [x0 + 0.6, ly + 0.025, z1 - 0.01],
    ],
    '#8feef5',
    'opacity="0.9"',
  );
  // glow oko linije
  const gl = project(cam, [0, ly, z1 - 0.01]);
  const gr = project(cam, [x1 - 0.6, ly, z1 - 0.01]);
  if (gl && gr) {
    const gw = Math.abs(gr[0] - gl[0]) * 2.4;
    svg += `<ellipse cx="${gl[0].toFixed(1)}" cy="${gl[1].toFixed(1)}" rx="${gw.toFixed(1)}" ry="${(gw * 0.16).toFixed(1)}" fill="url(#glow)"/>`;
  }

  // Pod: mat tamnosive plocice s fugama (fuga = tamniji rub kroz stroke)
  for (let zi = 0; zi * TILE < d; zi++) {
    for (let xi = 0; (xi + 1) * TILE <= w + 0.001; xi++) {
      const tx0 = x0 + xi * TILE,
        tx1 = Math.min(x0 + (xi + 1) * TILE, x1);
      const tz0 = z0 + zi * TILE,
        tz1 = Math.min(z0 + (zi + 1) * TILE, d);
      // blaga varijacija tona po plocici (deterministicka)
      const v = ((xi * 7 + zi * 13) % 5) - 2;
      const base = 74 + v; // ~#4a
      const fill = `rgb(${base},${base + 1},${base + 2})`;
      svg += poly(
        cam,
        [
          [tx0, 0, tz0],
          [tx1, 0, tz0],
          [tx1, 0, tz1],
          [tx0, 0, tz1],
        ],
        fill,
        'stroke="#3a3b3c" stroke-width="3"',
      );
    }
  }

  // Kontakt zid-pod: tamna traka uzduz straznjeg zida (mekani AO dojam)
  svg += poly(
    cam,
    [
      [x0, 0, z1],
      [x1, 0, z1],
      [x1, 0, z1 - 0.45],
      [x0, 0, z1 - 0.45],
    ],
    '#3f4041',
    'opacity="0.35"',
  );

  // Vinjeta preko svega
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#e8e8e6"/>${svg}</svg>`;
}

// --- 4 kuta vodjenog fotografiranja (guided-shots.ts) ----------------------
// Auto ce stajati oko [0, 0, 5.2] (sredina sobe po dubini). Kamera 1.4m.
const CAR = [0, 0.7, 5.6];
const ANGLES = {
  'front-left': { pos: [-4.6, 1.4, 1.2], fov: 54 },
  side: { pos: [-6.4, 1.4, 5.6], fov: 56 },
  'rear-right': { pos: [4.6, 1.4, 1.2], fov: 54 },
  rear: { pos: [0, 1.4, 0.9], fov: 54 },
};

import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });
for (const [name, a] of Object.entries(ANGLES)) {
  const cam = camera(a.pos, CAR, a.fov);
  const svg = renderScene(cam);
  const file = path.join(OUT, `studio-${name}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile(file);
  console.log('OK', file);
}
