import { describe, expect, it } from 'vitest';
import { formatPrice, PRICE_ON_REQUEST, roundPriceInput } from '../src/price';

describe('formatPrice (13.1)', () => {
  it('formatira u €X.XXX,- obliku', () => {
    expect(formatPrice(23990)).toBe('€23.990,-');
    expect(formatPrice(990)).toBe('€990,-');
    expect(formatPrice(1234567)).toBe('€1.234.567,-');
    expect(formatPrice(5)).toBe('€5,-');
  });
  it('null/undefined daje "Na upit", nikad praznu traku', () => {
    expect(formatPrice(null)).toBe(PRICE_ON_REQUEST);
    expect(formatPrice(undefined)).toBe(PRICE_ON_REQUEST);
  });
  it('decimale su greska upstream koda, ne tiho zaokruzivanje', () => {
    expect(() => formatPrice(23990.5)).toThrow();
    expect(() => formatPrice(-1)).toThrow();
    expect(() => formatPrice(Number.NaN)).toThrow();
  });
});

describe('roundPriceInput', () => {
  it('zaokruzuje na cijeli euro pri unosu', () => {
    expect(roundPriceInput(23990.4)).toBe(23990);
    expect(roundPriceInput(23989.5)).toBe(23990);
  });
});
