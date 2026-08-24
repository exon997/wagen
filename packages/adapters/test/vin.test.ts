import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockVinAdapter, VindataVinAdapter } from '../src/vin/index';

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'vindata-bmw-x1.json'), 'utf8'),
) as unknown;

describe('VindataVinAdapter mapiranje (stvarni odgovor, sinov BMW)', () => {
  it('mapira make/model/motorizaciju/godinu i 62 option koda', async () => {
    const adapter = new VindataVinAdapter('test-key');
    // privatni mapper testiramo kroz decode s mockanim fetchom
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response(JSON.stringify(fixture), { status: 200 }))) as typeof fetch;
    try {
      const result = await adapter.decode('WBAJG310303F05030');
      expect(result.found).toBe(true);
      expect(result.make).toBe('BMW');
      expect(result.model).toBe('X1');
      expect(result.engineLabel).toBe('sDrive20i');
      expect(result.modelYear).toBe(2018);
      expect(result.equipment.length).toBe(62);
      const mAero = result.equipment.find((e) => e.code === 's0715');
      expect(mAero?.name).toBe('M Aerodynamics package');
      expect(result.raw).toEqual(fixture);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('404 = promasaj, ne greska (3.2 neprimjetni fallback)', async () => {
    const adapter = new VindataVinAdapter('test-key');
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(new Response('{"error":"VIN not found"}', { status: 404 }))) as typeof fetch;
    try {
      const result = await adapter.decode('WVWZZZ1JZ5W123456');
      expect(result.found).toBe(false);
      expect(result.make).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('MockVinAdapter', () => {
  it('vraca injektirane rezultate', async () => {
    const mock = new MockVinAdapter({ ABC: { make: 'BMW', model: 'X1' } });
    expect((await mock.decode('ABC')).make).toBe('BMW');
    expect((await mock.decode('XYZ')).found).toBe(false);
  });
});
