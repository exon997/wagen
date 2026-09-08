/**
 * TemplateConfig (spec 3.2): jsonb u video_templates.config, zod
 * validiran u workeru prije rendera. Novi template = novi red u bazi +
 * komponenta ovdje - NIKAD update aplikacije.
 */
import { z } from 'zod';

export const sceneSchema = z.object({
  photoIndex: z.union([z.number().int().min(0), z.literal('auto')]),
  durationSec: z.number().positive(),
  motion: z.enum(['zoomIn', 'zoomOut', 'panL', 'panR']),
  overlay: z.enum(['spec', 'none']).optional(),
});

export const templateConfigSchema = z.object({
  slug: z.string().min(1),
  version: z.number().int().positive(),
  durationSec: z.number().positive(),
  hook: z.object({
    type: z.enum(['hero', 'text']),
    text: z.string().optional(),
    durationSec: z.number().positive(),
  }),
  scenes: z.array(sceneSchema).min(1),
  price: z.object({
    show: z.enum(['always', 'reveal', 'never']),
    revealAtSec: z.number().optional(),
  }),
  endCard: z.object({
    headline: z.string(),
    cta: z.string(),
    showQr: z.boolean(),
  }),
  captionTemplate: z.string(),
  hashtags: z.array(z.string()),
  locale: z.enum(['hr', 'sl', 'en']),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type SceneConfig = z.infer<typeof sceneSchema>;

/** Podaci oglasa koje worker slaze i predaje kompoziciji kao inputProps. */
export const renderInputSchema = z.object({
  config: templateConfigSchema,
  /** Potpisani URL-ovi OBRADJENIH fotki, sortirani (naslovna prva). */
  photos: z.array(z.string().url()).min(1),
  listing: z.object({
    titleLine1: z.string(),
    titleLine2: z.string().nullable(),
    /** Format 13.1 (€23.990,-) slozen na serveru; null = Na upit. */
    priceLabel: z.string().nullable(),
    year: z.number().nullable(),
    mileageKm: z.number().nullable(),
    engineLabel: z.string().nullable(),
    dealerName: z.string().nullable(),
  }),
  /** Kratki link za end card, npr. "wagen.hr/v/K7M2Q". */
  link: z.string(),
});

export type RenderInput = z.infer<typeof renderInputSchema>;
