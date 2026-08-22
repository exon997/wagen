import { describe, expect, it } from 'vitest';
import { checkDigitValid, decodeVinLocally, isStructurallyValidVin } from '../src/vin';

const NOW = new Date('2026-08-22');

describe('isStructurallyValidVin', () => {
  it('17 znakova bez I/O/Q', () => {
    expect(isStructurallyValidVin('WBAVA31070NL12345')).toBe(true);
    expect(isStructurallyValidVin('WBAVA31070NL1234')).toBe(false); // 16
    expect(isStructurallyValidVin('WBAVA31O70NL12345')).toBe(false); // slovo O
  });
});

describe('decodeVinLocally (3.2 fallback)', () => {
  it('WMI -> proizvodjac za podrzane marke', () => {
    expect(decodeVinLocally('WBAVA31070NL12345', NOW).manufacturer).toBe('BMW');
    expect(decodeVinLocally('TMBJJ7NE5K0123456', NOW).manufacturer).toBe('Škoda');
    expect(decodeVinLocally('VF1RFB00X61234567', NOW).manufacturer).toBe('Renault');
    expect(decodeVinLocally('5YJ3E1EA1KF123456', NOW).manufacturer).toBe('Tesla');
  });
  it('nepoznat WMI vraca null proizvodjaca ali valid VIN', () => {
    const d = decodeVinLocally('XX9ZZZ99Z9A123456', NOW);
    expect(d.valid).toBe(true);
    expect(d.manufacturer).toBeNull();
    expect(d.wmi).toBe('XX9');
  });
  it('godina iz pozicije 10, razrijesena na najnoviji plauzibilni ciklus', () => {
    // K = index 9 -> 1989 ili 2019; 2019 <= 2027 pa pobjedjuje
    expect(decodeVinLocally('TMBJJ7NE5K0123456', NOW).year).toBe(2019);
    // '5' -> 2034 nije plauzibilno u 2026 pa pada na 2004
    expect(decodeVinLocally('WVWZZZ1JZ5W123456', NOW).year).toBe(2005);
  });
  it('kratki predstandardni broj sasije -> oldtimer, direktno rucni unos', () => {
    const d = decodeVinLocally('10112345', NOW);
    expect(d.valid).toBe(false);
    expect(d.likelyOldtimer).toBe(true);
  });
  it('smece nije oldtimer nego nevaljan unos', () => {
    const d = decodeVinLocally('ab!', NOW);
    expect(d.valid).toBe(false);
    expect(d.likelyOldtimer).toBe(false);
  });
});

describe('checkDigitValid (samo NA VIN-ovi)', () => {
  it('validira poznati ispravan NA VIN', () => {
    // 1M8GDM9AXKP042788 - poznati ISO 3779 primjer s tocnom kontrolnom znamenkom X
    expect(checkDigitValid('1M8GDM9AXKP042788')).toBe(true);
  });
  it('pogresna znamenka pada', () => {
    expect(checkDigitValid('1M8GDM9A1KP042788')).toBe(false);
  });
});
