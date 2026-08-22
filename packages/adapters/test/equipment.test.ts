import { describe, expect, it } from 'vitest';
import {
  ensureEquipmentCode,
  MockEquipmentTranslator,
  type EquipmentCodeRow,
} from '../src/equipment/index';

function memoryRepo(seed: EquipmentCodeRow[] = []) {
  const rows = new Map(seed.map((r) => [`${r.manufacturer}/${r.code}`, r]));
  return {
    rows,
    find: (m: string, c: string) => Promise.resolve(rows.get(`${m}/${c}`) ?? null),
    saveMachineTranslation: (row: EquipmentCodeRow) => {
      rows.set(`${row.manufacturer}/${row.code}`, row);
      return Promise.resolve();
    },
  };
}

describe('ensureEquipmentCode (13.4 - prevedi jednom, zauvijek)', () => {
  it('nepoznat kod se prevodi i sprema kao machine_translated', async () => {
    const repo = memoryRepo();
    const translator = new MockEquipmentTranslator();
    const row = await ensureEquipmentCode(repo, translator, {
      manufacturer: 'BMW',
      code: 'S402A',
      nameEn: 'Panorama glass roof',
    });
    expect(row.translationStatus).toBe('machine_translated');
    expect(row.nameHr).toBe('HR:Panorama glass roof');
    expect(translator.calls).toHaveLength(1);
    expect(repo.rows.size).toBe(1);
  });

  it('postojeci kod se NIKAD ne prevodi ponovno', async () => {
    const repo = memoryRepo([
      {
        manufacturer: 'BMW',
        code: 'S402A',
        nameEn: 'Panorama glass roof',
        nameHr: 'Panoramski stakleni krov',
        translationStatus: 'approved',
      },
    ]);
    const translator = new MockEquipmentTranslator();
    const row = await ensureEquipmentCode(repo, translator, {
      manufacturer: 'BMW',
      code: 'S402A',
    });
    expect(row.nameHr).toBe('Panoramski stakleni krov');
    expect(translator.calls).toHaveLength(0);
  });

  it('untranslated red (upisan bez prijevoda) se dovrsava', async () => {
    const repo = memoryRepo([
      {
        manufacturer: 'Audi',
        code: 'PX2',
        nameEn: 'Matrix LED',
        nameHr: null,
        translationStatus: 'untranslated',
      },
    ]);
    const translator = new MockEquipmentTranslator();
    const row = await ensureEquipmentCode(repo, translator, { manufacturer: 'Audi', code: 'PX2' });
    expect(row.translationStatus).toBe('machine_translated');
    expect(translator.calls[0]?.nameEn).toBe('Matrix LED');
  });
});
