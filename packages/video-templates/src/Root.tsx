/**
 * Remotion root: jedna kompozicija po templateu (id = slug), 1080x1920@30.
 * Trajanje se racuna iz configa u inputProps (calculateMetadata) - worker
 * samo proslijedi RenderInput.
 */
import { Composition } from 'remotion';
import { renderInputSchema, type RenderInput } from './schema.js';
import { TEMPLATES } from './registry.js';
import { FPS, HEIGHT, WIDTH, totalDurationInFrames } from './timing.js';
import { ensureFonts } from './theme.js';

const PLACEHOLDER: RenderInput = {
  config: {
    slug: 'dealer-classic',
    version: 1,
    durationSec: 18,
    hook: { type: 'hero', durationSec: 2.4 },
    scenes: [{ photoIndex: 'auto', durationSec: 2.4, motion: 'zoomIn', overlay: 'spec' }],
    price: { show: 'always' },
    endCard: { headline: 'Pogledaj cijeli oglas', cta: 'wagen.hr', showQr: false },
    captionTemplate: '{make} {model} ({year}) — {link}',
    hashtags: ['#wagen'],
    locale: 'hr',
  },
  photos: ['https://wagen.hr/placeholder.jpg'],
  listing: {
    titleLine1: '2018. BMW X1 M Sport',
    titleLine2: 'sDrive20i · automatik',
    priceLabel: '€23.990,-',
    year: 2018,
    mileageKm: 95000,
    engineLabel: 'sDrive20i',
    dealerName: 'Demo salon',
  },
  link: 'wagen.hr/v/K7M2Q',
};

export function RemotionRoot() {
  void ensureFonts();
  return (
    <>
      {Object.entries(TEMPLATES).map(([slug, TemplateComponent]) => (
        <Composition
          key={slug}
          id={slug}
          component={TemplateComponent as React.FC<Record<string, unknown>>}
          width={WIDTH}
          height={HEIGHT}
          fps={FPS}
          durationInFrames={totalDurationInFrames(PLACEHOLDER.config)}
          defaultProps={PLACEHOLDER as unknown as Record<string, unknown>}
          calculateMetadata={({ props }) => {
            const input = renderInputSchema.parse(props);
            return { durationInFrames: totalDurationInFrames(input.config) };
          }}
        />
      ))}
    </>
  );
}
