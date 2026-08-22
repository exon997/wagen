# wagen

Marketplace za rabljena i nova vozila (wagen.hr) — web, mobilna aplikacija i
zajednicka domenska jezgra u jednom monorepu.

> **Izvor istine za projekt je [`docs/projektni-zadatak.md`](docs/projektni-zadatak.md).**
> Pravila rada i arhitekturna nacela: [`CLAUDE.md`](CLAUDE.md).

## Preduvjeti

- Node **24** (vidi `.nvmrc`)
- pnpm preko corepacka: `corepack enable`
- Docker Desktop (za lokalni Supabase stack — dolazi u koraku B1)

## Pokretanje

```bash
pnpm install
pnpm dev          # sve aplikacije
pnpm build        # build svega
pnpm typecheck    # provjera tipova
pnpm lint
pnpm format
```

## Struktura

| Putanja             | Sadrzaj                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `apps/web`          | Next.js — javni web, `/admin`, Kokpit trgovca                        |
| `apps/mobile`       | Expo — VIN sken, foto pipeline, predaja oglasa                       |
| `packages/domain`   | Kanonski model, tipovi, zod sheme, konstante (bez runtime ovisnosti) |
| `packages/supabase` | Supabase klijenti + generirani DB tipovi                             |
| `packages/adapters` | Sucelja i implementacije: DMS, fiskalizacija, email, VIN             |
| `packages/config`   | Dijeljeni tsconfig / eslint / prettier presets                       |
| `supabase/`         | Migracije i seed podaci                                              |
| `docs/`             | Projektni zadatak (izvor istine) i ADR-ovi                           |

## Napomene o toolchainu

- **pnpm + `nodeLinker: hoisted`** — Metro lose prati simbolicke linkove, pa
  `node_modules` mora biti plosnat. Store i workspace protokol ostaju.
- **Postavke pnpm-a idu u `pnpm-workspace.yaml`, ne u `.npmrc`.** pnpm 11 ne
  cita `node-linker`, `strict-peer-dependencies` i sl. iz `.npmrc` - postavka
  tamo tiho ne radi nista. Provjera: `pnpm config get node-linker` ne smije
  vratiti `undefined`.
- **Turborepo** za orkestraciju i cache zadataka.
