/**
 * Zajednicke scene za sve templatee (spec 3.2): PhotoScene s Ken Burns
 * pokretom, SpecOverlay, PricePill (13.1), Watermark, EndCard.
 * Tekst postuje TikTok safe zonu (donjih 20 %, desnih 12 %).
 */
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderInput, SceneConfig } from './schema.js';
import {
  CYAN,
  FONT_BOLD,
  FONT_BOLD_ITALIC,
  FONT_EXTRABOLD,
  FONT_REGULAR,
  INK,
  SAFE_RIGHT_PCT,
  WHITE,
} from './theme.js';

/** Ken Burns: fotka 4:3 u 9:16 kadru - cover + spori zoom/pan po sceni. */
export function PhotoScene({
  src,
  motion,
  durationInFrames,
}: {
  src: string;
  motion: SceneConfig['motion'];
  durationInFrames: number;
}) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const scale =
    motion === 'zoomIn' ? 1 + 0.12 * t : motion === 'zoomOut' ? 1.12 - 0.12 * t : 1.1;
  const translateX = motion === 'panL' ? 4 - 8 * t : motion === 'panR' ? -4 + 8 * t : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: INK, overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${scale}) translateX(${translateX}%)`,
        }}
      />
    </AbsoluteFill>
  );
}

/** Cijena: crna bold italic na cyan pozadini - identicno svugdje (13.1). */
export function PricePill({ label, fontSize = 64 }: { label: string; fontSize?: number }) {
  return (
    <div
      style={{
        display: 'inline-block',
        backgroundColor: CYAN,
        color: INK,
        fontFamily: FONT_BOLD_ITALIC,
        fontStyle: 'italic',
        fontSize,
        lineHeight: 1.35,
        padding: `${fontSize * 0.12}px ${fontSize * 0.45}px`,
        borderRadius: 10,
      }}
    >
      {label}
    </div>
  );
}

/** Spec overlay: naslov (13.1 dvoredni) + kljucne brojke, dolje-lijevo
 *  IZNAD safe zone. */
export function SpecOverlay({ listing }: { listing: RenderInput['listing'] }) {
  const facts = [
    listing.year ? `${listing.year}.` : null,
    listing.mileageKm ? `${listing.mileageKm.toLocaleString('de-DE')} km` : null,
    listing.engineLabel,
  ].filter(Boolean);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end' }}>
      <div
        style={{
          marginBottom: '23%',
          marginLeft: 48,
          marginRight: `${SAFE_RIGHT_PCT + 4}%`,
        }}
      >
        <div
          style={{
            color: WHITE,
            fontFamily: FONT_EXTRABOLD,
            fontSize: 58,
            lineHeight: 1.1,
            textShadow: '0 2px 14px rgba(0,0,0,0.75)',
          }}
        >
          {listing.titleLine1}
        </div>
        {listing.titleLine2 && (
          <div
            style={{
              color: WHITE,
              fontFamily: FONT_REGULAR,
              fontSize: 38,
              marginTop: 6,
              textShadow: '0 2px 14px rgba(0,0,0,0.75)',
            }}
          >
            {listing.titleLine2}
          </div>
        )}
        {facts.length > 0 && (
          <div
            style={{
              color: WHITE,
              fontFamily: FONT_BOLD,
              fontSize: 42,
              marginTop: 14,
              textShadow: '0 2px 14px rgba(0,0,0,0.75)',
            }}
          >
            {facts.join('  ·  ')}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

/** wagen.hr diskretno cijelo vrijeme, gore-lijevo (~4 % sirine visine slova). */
export function Watermark() {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 40,
          color: WHITE,
          fontFamily: FONT_EXTRABOLD,
          fontStyle: 'italic',
          fontSize: 40,
          opacity: 0.82,
          textShadow: '0 1px 8px rgba(0,0,0,0.6)',
        }}
      >
        wagen.hr
      </div>
    </AbsoluteFill>
  );
}

/** End card (zadnje ~2,5 s): headline + kratki link KRUPNO + store uputa.
 *  Bez QR-a (spec: s istog ekrana se ne moze skenirati). */
export function EndCard({
  headline,
  link,
  priceLabel,
  dealerName,
}: {
  headline: string;
  link: string;
  priceLabel: string | null;
  dealerName: string | null;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const appear = interpolate(frame, [0, fps * 0.4], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: INK,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: appear,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '18%' }}>
        <div style={{ color: WHITE, fontFamily: FONT_EXTRABOLD, fontSize: 66 }}>{headline}</div>
        {priceLabel && (
          <div style={{ marginTop: 34 }}>
            <PricePill label={priceLabel} fontSize={72} />
          </div>
        )}
        <div
          style={{
            color: CYAN,
            fontFamily: FONT_EXTRABOLD,
            fontSize: 84,
            marginTop: 44,
            letterSpacing: 1,
          }}
        >
          {link}
        </div>
        {dealerName && (
          <div style={{ color: WHITE, fontFamily: FONT_BOLD, fontSize: 40, marginTop: 40 }}>
            {dealerName}
          </div>
        )}
        <div style={{ color: '#9a9a9a', fontFamily: FONT_REGULAR, fontSize: 30, marginTop: 18 }}>
          ili potraži wagen u App Storeu / Play Storeu
        </div>
      </div>
    </AbsoluteFill>
  );
}
