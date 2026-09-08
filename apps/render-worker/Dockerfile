# Build iz KORIJENA repoa: docker build -f apps/render-worker/Dockerfile .
FROM node:22-bookworm-slim

# Chromium headless shell ovisnosti (Remotion, Debian bookworm) + fontovi
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libasound2 \
    libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 \
    libgbm1 libcups2 libpango-1.0-0 libcairo2 libcurl4 \
    fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace: lockfile + manifesti prije izvora radi Docker cachea
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/render-worker ./apps/render-worker

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate \
  && pnpm install --frozen-lockfile --filter @wagen/render-worker...

# Chromium se pece u image (bez downloada pri svakom startu)
RUN node --input-type=module -e "const m = await import('@remotion/renderer'); await m.ensureBrowser();"

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@wagen/render-worker", "start"]
