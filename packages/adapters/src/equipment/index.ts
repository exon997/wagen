/**
 * E3: Equipment-code translation (13.4 - ODLUCENO: the dictionary builds
 * itself). The number of option codes is finite - listings are never
 * translated, CODES are, once, forever.
 *
 * Flow: ingest hits an unknown (manufacturer, code) -> one Claude API call
 * translates the name -> stored permanently with status machine_translated
 * -> admin review queue approves (18.3). The English original stays
 * available in Sloj 2 (13.4).
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

export interface EquipmentCodeInput {
  /** Vehicle manufacturer the code belongs to, e.g. "BMW". */
  manufacturer: string;
  /** Factory option code, e.g. "S402A". */
  code: string;
  /** English name when the feed carries one; Claude infers it otherwise. */
  nameEn?: string | null;
}

export interface EquipmentTranslation {
  nameEn: string;
  nameHr: string;
  /** Predloziti fotografiranje ove znacajke? (v1.1 mehanizam) */
  photoSuggest: boolean;
  /** Prodajna vrijednost 1-5 (null kad se ne predlaze). */
  photoRank: number | null;
  /** Kratka uputa za kadar (null kad se ne predlaze). */
  photoHint: string | null;
}

export interface EquipmentTranslator {
  translate(input: EquipmentCodeInput): Promise<EquipmentTranslation>;
}

const translationSchema = z.object({
  name_en: z.string().describe('English name of the equipment item'),
  name_hr: z.string().describe('Croatian translation, automotive terminology'),
  photo_suggest: z.boolean().describe('Should the app suggest a dedicated photo of this feature?'),
  photo_rank: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .describe('Selling value 1-5 when suggested, null otherwise'),
  photo_hint: z
    .string()
    .nullable()
    .describe('Short Croatian instruction for the shot, null when not suggested'),
});

const SYSTEM_PROMPT = `You translate vehicle factory equipment/option names into Croatian for a car marketplace.
Rules:
- Use established Croatian automotive terminology (as used by dealers and car magazines).
- Keep proper nouns and brand names untranslated (Harman Kardon, LED, USB, Head-Up).
- Be concise - these are labels on a listing page, not sentences.
- If only a code is given and you are not confident what it means for that manufacturer, use the code itself as name_en and give a literal, cautious name_hr.

Also classify for photo suggestions. The guided flow ALREADY covers 16 standard shots: 6 exterior angles, front-left wheel (rims!), views through driver and passenger doors (seats, dash, steering wheel), instrument cluster, center dash (main display, ventilation), center console (switches), rear bench, driver POV, open trunk.
photo_suggest=true ONLY if the feature is (1) visually demonstrable, (2) NOT already visible in the standard shots, (3) a selling point buyers care about. Administrative codes (emission norms, language versions, service intervals), invisible software/services, and anything covered by standard shots get false. When true, give photo_rank (5 = top selling point) and a short Croatian photo_hint (max 8 words).`;

export class AnthropicEquipmentTranslator implements EquipmentTranslator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : undefined);
    this.model = options.model ?? 'claude-opus-5';
  }

  async translate(input: EquipmentCodeInput): Promise<EquipmentTranslation> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Manufacturer: ${input.manufacturer}\nOption code: ${input.code}\nEnglish name: ${input.nameEn ?? '(unknown - infer from the code if you can)'}`,
        },
      ],
      output_config: { format: zodOutputFormat(translationSchema) },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `Prijevod koda ${input.manufacturer}/${input.code} nije parsiran (stop: ${response.stop_reason})`,
      );
    }
    return {
      nameEn: parsed.name_en,
      nameHr: parsed.name_hr,
      photoSuggest: parsed.photo_suggest,
      photoRank: parsed.photo_rank,
      photoHint: parsed.photo_hint,
    };
  }
}

/** Deterministic translator for tests and offline development. */
export class MockEquipmentTranslator implements EquipmentTranslator {
  readonly calls: EquipmentCodeInput[] = [];

  translate(input: EquipmentCodeInput): Promise<EquipmentTranslation> {
    this.calls.push(input);
    return Promise.resolve({
      nameEn: input.nameEn ?? input.code,
      nameHr: 'HR:' + (input.nameEn ?? input.code),
      photoSuggest: false,
      photoRank: null,
      photoHint: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Orchestration: "translate once, store forever" (13.4). The repository is a
// narrow interface so this stays testable and free of a Supabase dependency;
// the Node worker implements it over public.equipment_codes.
// ---------------------------------------------------------------------------

export interface EquipmentCodeRow {
  manufacturer: string;
  code: string;
  nameEn: string | null;
  nameHr: string | null;
  translationStatus: 'untranslated' | 'machine_translated' | 'approved';
  photoSuggest?: boolean;
  photoRank?: number | null;
  photoHint?: string | null;
}

export interface EquipmentCodeRepository {
  find(manufacturer: string, code: string): Promise<EquipmentCodeRow | null>;
  /** Insert or update the row after machine translation. */
  saveMachineTranslation(row: EquipmentCodeRow): Promise<void>;
}

/**
 * Returns the dictionary entry for a code, translating and persisting it on
 * first encounter. Existing entries are returned as-is - a code is NEVER
 * re-translated (the dictionary is append-once; corrections go through the
 * admin review queue, 18.3).
 */
export async function ensureEquipmentCode(
  repo: EquipmentCodeRepository,
  translator: EquipmentTranslator,
  input: EquipmentCodeInput,
): Promise<EquipmentCodeRow> {
  const existing = await repo.find(input.manufacturer, input.code);
  if (existing && existing.translationStatus !== 'untranslated') {
    return existing;
  }

  const translation = await translator.translate({
    ...input,
    nameEn: input.nameEn ?? existing?.nameEn ?? null,
  });

  const row: EquipmentCodeRow = {
    manufacturer: input.manufacturer,
    code: input.code,
    nameEn: translation.nameEn,
    nameHr: translation.nameHr,
    translationStatus: 'machine_translated',
    photoSuggest: translation.photoSuggest,
    photoRank: translation.photoRank,
    photoHint: translation.photoHint,
  };
  await repo.saveMachineTranslation(row);
  return row;
}
