import type { TemplateConfig } from './schema';

/** End card traje zadnje 2,5 s (spec 3.2) - nije dio config.scenes. */
export const END_CARD_SEC = 2.5;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** Ukupno trajanje: hook + scene + end card (config.durationSec je informativan). */
export function totalDurationInFrames(config: TemplateConfig, fps: number = FPS): number {
  const seconds =
    config.hook.durationSec +
    config.scenes.reduce((sum, s) => sum + s.durationSec, 0) +
    END_CARD_SEC;
  return Math.round(seconds * fps);
}
