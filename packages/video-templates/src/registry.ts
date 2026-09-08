/**
 * Registry (spec 3.2): slug -> React komponenta. Worker bira kompoziciju
 * po slugu iz render_jobs; config dolazi iz baze (video_templates).
 */
import type { RenderInput } from './schema';
import { DealerClassic } from './templates/DealerClassic';

export const TEMPLATES: Record<string, React.FC<RenderInput>> = {
  'dealer-classic': DealerClassic,
};

export function getTemplate(slug: string): React.FC<RenderInput> {
  const component = TEMPLATES[slug];
  if (!component) throw new Error(`Nepoznat video template: ${slug}`);
  return component;
}
