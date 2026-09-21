/**
 * Display metadata for the backend's place categories (app/ml/types.py
 * CATEGORIES on the server). Unknown categories fall back to a generic pin, so a
 * new server category never breaks the app.
 */

import type { MaterialName, SFName } from '@/components/icon';

export interface CategoryInfo {
  label: string;
  sf: SFName;
  md: MaterialName;
}

export const CATEGORIES = {
  cafe: { label: 'Cafés', sf: 'cup.and.saucer.fill', md: 'local_cafe' },
  restaurant: { label: 'Restaurants', sf: 'fork.knife', md: 'restaurant' },
  fast_food: { label: 'Fast food', sf: 'takeoutbag.and.cup.and.straw.fill', md: 'fastfood' },
  bar: { label: 'Bars', sf: 'wineglass.fill', md: 'local_bar' },
  library: { label: 'Libraries', sf: 'books.vertical.fill', md: 'local_library' },
  university: { label: 'Campus', sf: 'graduationcap.fill', md: 'school' },
  school: { label: 'Schools', sf: 'backpack.fill', md: 'backpack' },
  gym: { label: 'Gyms', sf: 'dumbbell.fill', md: 'fitness_center' },
  sports: { label: 'Sports', sf: 'sportscourt.fill', md: 'sports_basketball' },
  park: { label: 'Parks', sf: 'tree.fill', md: 'park' },
  stadium: { label: 'Stadiums', sf: 'figure.american.football', md: 'stadium' },
  supermarket: { label: 'Groceries', sf: 'cart.fill', md: 'local_grocery_store' },
  convenience: { label: 'Convenience stores', sf: 'basket.fill', md: 'storefront' },
  shop: { label: 'Shopping', sf: 'bag.fill', md: 'shopping_bag' },
  cinema: { label: 'Movies', sf: 'film.fill', md: 'movie' },
  theatre: { label: 'Theatre & arts', sf: 'theatermasks.fill', md: 'theater_comedy' },
  museum: { label: 'Museums', sf: 'building.columns.fill', md: 'museum' },
  worship: { label: 'Places of worship', sf: 'building.fill', md: 'church' },
  healthcare: { label: 'Healthcare', sf: 'cross.case.fill', md: 'local_hospital' },
  pharmacy: { label: 'Pharmacies', sf: 'pills.fill', md: 'local_pharmacy' },
  bank: { label: 'Banks', sf: 'banknote.fill', md: 'account_balance' },
  fuel: { label: 'Gas stations', sf: 'fuelpump.fill', md: 'local_gas_station' },
  parking: { label: 'Parking', sf: 'parkingsign', md: 'local_parking' },
  lodging: { label: 'Hotels', sf: 'bed.double.fill', md: 'hotel' },
  office: { label: 'Offices', sf: 'building.2.fill', md: 'business' },
  other: { label: 'Other places', sf: 'mappin', md: 'place' },
} as const satisfies Record<string, CategoryInfo>;

export type Category = keyof typeof CATEGORIES;

const FALLBACK: CategoryInfo = { label: 'Other places', sf: 'mappin', md: 'place' };

export function categoryInfo(category: string): CategoryInfo {
  return Object.hasOwn(CATEGORIES, category) ? CATEGORIES[category as Category] : FALLBACK;
}
