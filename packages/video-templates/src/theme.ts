/**
 * Vizualni sustav videa: oglasnik identitet (cyan #1EDCE8, 6.3), Exo 2 iz
 * public/fonts. Cijena je UVIJEK crna bold italic na cyan pozadini (13.1).
 */
import { staticFile } from 'remotion';
import { loadFont } from '@remotion/fonts';

export const CYAN = '#1EDCE8';
export const INK = '#0B0B0B';
export const WHITE = '#FFFFFF';

export const FONT_REGULAR = 'Exo2';
export const FONT_BOLD = 'Exo2-Bold';
export const FONT_EXTRABOLD = 'Exo2-ExtraBold';
export const FONT_BOLD_ITALIC = 'Exo2-BoldItalic';

/** Safe zona (spec 3.2): donjih 20 % i desnih 12 % bez bitnog sadrzaja. */
export const SAFE_BOTTOM_PCT = 20;
export const SAFE_RIGHT_PCT = 12;

let fontsLoaded: Promise<unknown> | null = null;

/** Ucita Exo 2 iz bundla (poziva se u Rootu; idempotentno). */
export function ensureFonts(): Promise<unknown> {
  fontsLoaded ??= Promise.all([
    loadFont({ family: FONT_REGULAR, url: staticFile('fonts/Exo2-Regular.ttf') }),
    loadFont({ family: FONT_BOLD, url: staticFile('fonts/Exo2-Bold.ttf') }),
    loadFont({ family: FONT_EXTRABOLD, url: staticFile('fonts/Exo2-ExtraBold.ttf') }),
    loadFont({ family: FONT_BOLD_ITALIC, url: staticFile('fonts/Exo2-BoldItalic.ttf') }),
  ]);
  return fontsLoaded;
}
