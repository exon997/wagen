import { describe, expect, it } from 'vitest';
import { MockDmsAdapter, type DmsVehicleRecord } from '../src/dms/index';
import { NoopFiscalizationAdapter } from '../src/fiscalization/index';
import { ConsoleEmailAdapter } from '../src/email/index';

describe('DmsAdapter (12.2 - field ownership u tipu)', () => {
  it('DmsVehicleRecord strukturno NE MOZE nositi enrichment polja', () => {
    // Compile-time garancija: ova polja ne postoje u tipu. Runtime provjera
    // da mock nista takvo ne vraca.
    const record: DmsVehicleRecord = {
      externalId: 'ab-123',
      vin: 'WBAVA31070NL12345',
      make: 'BMW',
      model: 'X1',
      trim: 'M Sport',
      engineLabel: 'sDrive20i',
      firstRegistrationYear: 2018,
      mileageKm: 89000,
      priceEur: 23990,
      vatDeductible: false,
      attributes: { fuel: 'benzin' },
      description: 'Uredan auto',
      photos: [{ url: 'https://example.com/1.jpg', sortOrder: 0 }],
      equipmentCodes: ['S402A'],
      inStock: true,
      raw: {},
    };
    expect(record).not.toHaveProperty('highlightBadge');
    expect(record).not.toHaveProperty('topUntil');
    expect(record).not.toHaveProperty('photoOrder');
    expect(record).not.toHaveProperty('enrichedDescription');
  });

  it('mock vraca injektirani inventar', async () => {
    const adapter = new MockDmsAdapter([]);
    const result = await adapter.fetchInventory({ dealerId: 'd1', connection: {} });
    expect(result.records).toEqual([]);
    expect(adapter.source).toBe('mock');
  });
});

describe('NoopFiscalizationAdapter (9.7)', () => {
  it('preskace fiskalizaciju - racun ostaje pending, nista tiho fiskalizirano', async () => {
    const adapter = new NoopFiscalizationAdapter();
    const result = await adapter.fiscalize({
      invoiceId: 'i1',
      number: '1-1-1',
      issuedAt: new Date(),
      lineItems: [],
      netAmountCents: 1900,
      vatAmountCents: 475,
      totalAmountCents: 2375,
      currency: 'EUR',
      buyerTaxId: null,
    });
    expect(result.status).toBe('skipped');
  });
});

describe('ConsoleEmailAdapter (14.6)', () => {
  it('vraca id bez slanja', async () => {
    const adapter = new ConsoleEmailAdapter();
    const r = await adapter.send({ to: 'test@wagen.hr', subject: 'Test', html: '<p>t</p>' });
    expect(r.id).toMatch(/^console-/);
  });
});
