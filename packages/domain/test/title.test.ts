import { describe, expect, it } from 'vitest';
import { generateListingSlug, generateListingTitle } from '../src/title';

describe('generateListingTitle (13.1)', () => {
  it('slaze dvoredni naslov iz strukturiranih podataka', () => {
    const t = generateListingTitle({
      firstRegistrationYear: 2018,
      make: 'BMW',
      model: 'X1',
      trim: 'M Sport',
      engineLabel: 'sDrive20i',
      transmissionLabel: 'Automatik',
    });
    expect(t.line1).toBe('2018 BMW X1 M Sport');
    expect(t.line2).toBe('sDrive20i Automatik');
  });
  it('izostavlja prazna polja bez duplih razmaka', () => {
    const t = generateListingTitle({ make: 'Zastava', model: '750' });
    expect(t.line1).toBe('Zastava 750');
    expect(t.line2).toBe('');
  });
});

describe('generateListingSlug (17.1)', () => {
  it('generira slug s kratkim id sufiksom, bez dijakritike', () => {
    const s = generateListingSlug(
      {
        firstRegistrationYear: 2018,
        make: 'BMW',
        model: 'X1',
        trim: 'M Sport',
        engineLabel: 'sDrive20i',
        transmissionLabel: 'Automatik',
      },
      'a4f7',
    );
    expect(s).toBe('2018-bmw-x1-m-sport-sdrive20i-automatik-a4f7');
  });
  it('hrvatska slova prelaze u ascii', () => {
    const s = generateListingSlug({ make: 'Škoda', model: 'Superb', trim: 'Đir čžš' }, 'x1y2');
    expect(s).toBe('skoda-superb-dir-czs-x1y2');
  });
});
