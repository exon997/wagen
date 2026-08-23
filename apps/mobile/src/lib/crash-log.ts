/**
 * Crna kutija za produkcijske buildove: preview/production build nema dev
 * overlay, pa fatalna JS greska rusi app bez traga. Ovdje se svaka greska
 * snimi u AsyncStorage PRIJE rusenja - iduce otvaranje aplikacije je
 * prikaze na ekranu. Za udaljeni teren (sinov A56) to je jedini izvor
 * dijagnostike bez adb-a.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wagen.lastCrash';

interface RnErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack ?? ''}`;
  return String(error);
}

export function installCrashLogger(): void {
  const errorUtils = (globalThis as { ErrorUtils?: RnErrorUtils }).ErrorUtils;
  if (!errorUtils) return;
  const original = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    // Sinkroni best-effort zapis; ne cekamo - app mozda upravo umire
    void AsyncStorage.setItem(
      KEY,
      JSON.stringify({ at: new Date().toISOString(), fatal: !!isFatal, error: describe(error) }),
    ).catch(() => undefined);
    original(error, isFatal);
  });
}

export async function getLastCrash(): Promise<{
  at: string;
  fatal: boolean;
  error: string;
} | null> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as { at: string; fatal: boolean; error: string }) : null;
}

export async function clearLastCrash(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
