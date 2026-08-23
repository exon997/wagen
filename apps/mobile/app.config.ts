import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

// .env.local zivi u ROOTU monorepa - ucitaj EXPO_PUBLIC_* prije evaluacije
// configa (isti pristup kao apps/web/next.config.ts).
const rootEnvPath = path.join(__dirname, '..', '..', '.env.local');
if (fs.existsSync(rootEnvPath)) {
  for (const line of fs.readFileSync(rootEnvPath, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)="?([^"]*)"?\s*$/.exec(line.trim());
    if (match && match[1] && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'wagen',
  slug: 'wagen',
  version: '0.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'wagen',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'hr.wagen.app',
  },
  android: {
    package: 'hr.wagen.app',
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#000000',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  owner: 'wagen',
  extra: {
    eas: {
      projectId: '69269736-854f-4ed9-bdf6-96c3e3f41e24',
    },
    supabaseUrl: process.env['EXPO_PUBLIC_SUPABASE_URL'],
    supabasePublishableKey: process.env['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'],
  },
});
