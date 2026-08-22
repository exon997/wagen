import { describe, expect, it } from 'vitest';
import { badgeDisplayLabel, isBadgeSelectable, selectableBadges } from '../src/badges';

describe('badges (9.6)', () => {
  it('sport_paket etiketa ovisi o marki', () => {
    expect(badgeDisplayLabel('sport_paket', 'BMW')).toBe('M Sport paket');
    expect(badgeDisplayLabel('sport_paket', 'Audi')).toBe('S line');
    expect(badgeDisplayLabel('sport_paket', 'Dacia')).toBeNull();
  });
  it('prvi_vlasnik samo kad je broj vlasnika 1', () => {
    expect(isBadgeSelectable('prvi_vlasnik', { make: 'BMW', ownersCount: 1 })).toBe(true);
    expect(isBadgeSelectable('prvi_vlasnik', { make: 'BMW', ownersCount: 2 })).toBe(false);
  });
  it('potpuna_servisna samo uz servisnu knjigu', () => {
    expect(isBadgeSelectable('potpuna_servisna', { make: 'BMW', serviceBook: 'da' })).toBe(true);
    expect(isBadgeSelectable('potpuna_servisna', { make: 'BMW', serviceBook: 'ne' })).toBe(false);
  });
  it('malo_kilometara se NIKAD ne bira rucno (automatski izracun)', () => {
    expect(isBadgeSelectable('malo_kilometara', { make: 'BMW' })).toBe(false);
  });
  it('audio bedzevi filtrirani po marki', () => {
    expect(isBadgeSelectable('harman_kardon', { make: 'BMW' })).toBe(true);
    expect(isBadgeSelectable('burmester', { make: 'BMW' })).toBe(false);
    expect(isBadgeSelectable('bang_olufsen', { make: 'Audi' })).toBe(true);
  });
  it('Dacia bez sport grupe u pickeru', () => {
    const badges = selectableBadges({ make: 'Dacia', ownersCount: 3 });
    expect(badges).not.toContain('sport_paket');
    expect(badges).toContain('nove_gume');
  });
});
