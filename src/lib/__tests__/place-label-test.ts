import { visitCategory, visitPlaceName, visitTitle } from '@/lib/place-label';

const base = { lat: 30.616, lon: -96.3393, label: null, placeName: null, placeCategory: null };

describe('visit place labels', () => {
  test('prefers the resolved place name', () => {
    expect(visitPlaceName({ ...base, placeName: 'Evans Library', label: 'Home' })).toBe('Evans Library');
    expect(visitTitle({ ...base, placeName: 'Evans Library' })).toBe('Evans Library');
  });

  test('falls back to a user label, then to coordinates', () => {
    expect(visitPlaceName({ ...base, label: 'Home' })).toBe('Home');
    expect(visitTitle({ ...base, label: 'Home' })).toBe('Home');
    expect(visitTitle(base)).toBe('30.6160, -96.3393');
  });

  test('treats blank and missing fields as unresolved', () => {
    expect(visitPlaceName({ ...base, placeName: '   ' })).toBeNull();
    expect(visitPlaceName({ label: null, placeName: null })).toBeNull();
    expect(visitCategory({ placeCategory: '  ' })).toBeNull();
    expect(visitCategory({ placeCategory: null })).toBeNull();
    expect(visitCategory({ placeCategory: 'library' })).toBe('library');
  });
});
