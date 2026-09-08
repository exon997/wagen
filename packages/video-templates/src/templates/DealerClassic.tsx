/**
 * dealer-classic v1: hero hook -> foto scene s Ken Burns i spec
 * overlayima -> end card s cijenom (13.1) i kratkim linkom. Zamjena za
 * dosadasnji browser-render iz Kokpita (V1, doc 4.7).
 */
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import type { RenderInput } from '../schema.js';
import { EndCard, PhotoScene, PricePill, SpecOverlay, Watermark } from '../components.js';
import { END_CARD_SEC } from '../timing.js';

export function DealerClassic({ config, photos, listing, link }: RenderInput) {
  const { fps } = useVideoConfig();
  const sec = (s: number) => Math.round(s * fps);

  const hookFrames = sec(config.hook.durationSec);
  const showPrice = config.price.show !== 'never';

  // 'auto' raspored: hook trosi fotku 0, scene idu redom dalje (wrap)
  let cursor = 1;
  const sceneStarts: { from: number; frames: number; photo: string; overlay: boolean }[] = [];
  let at = hookFrames;
  for (const scene of config.scenes) {
    const idx =
      scene.photoIndex === 'auto' ? cursor++ % photos.length : scene.photoIndex % photos.length;
    const frames = sec(scene.durationSec);
    sceneStarts.push({
      from: at,
      frames,
      photo: photos[idx]!,
      overlay: scene.overlay === 'spec',
    });
    at += frames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0B0B0B' }}>
      {/* Hook: naslovna fotka + naslov + cijena - prve 2 s, bez intro loga */}
      <Sequence durationInFrames={hookFrames}>
        <PhotoScene src={photos[0]!} motion="zoomIn" durationInFrames={hookFrames} />
        <SpecOverlay listing={listing} />
        {showPrice && listing.priceLabel && (
          <AbsoluteFill>
            <div style={{ position: 'absolute', top: 120, left: 48 }}>
              <PricePill label={listing.priceLabel} />
            </div>
          </AbsoluteFill>
        )}
      </Sequence>

      {sceneStarts.map((s, i) => (
        <Sequence key={i} from={s.from} durationInFrames={s.frames}>
          <PhotoScene
            src={s.photo}
            motion={config.scenes[i]!.motion}
            durationInFrames={s.frames}
          />
          {s.overlay && <SpecOverlay listing={listing} />}
        </Sequence>
      ))}

      <Sequence from={at} durationInFrames={sec(END_CARD_SEC)}>
        <EndCard
          headline={config.endCard.headline}
          link={link}
          priceLabel={showPrice ? listing.priceLabel : null}
          dealerName={listing.dealerName}
        />
      </Sequence>

      <Watermark />
    </AbsoluteFill>
  );
}
