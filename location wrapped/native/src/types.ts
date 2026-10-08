export type PlaceCategory =
  | 'Home'
  | 'School'
  | 'Work'
  | 'Food'
  | 'Shopping'
  | 'Fitness'
  | 'Entertainment'
  | 'Outdoors'
  | 'Travel'
  | 'Other';

export type LocationPoint = {
  id: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number | null;
  session?: string;
};

export type Visit = {
  id: string;
  latitude: number;
  longitude: number;
  arrival: number;
  departure: number;
  durationMinutes: number;
  uncertainMinutes?: number;
  source?: 'gps';
  startEstimated?: boolean;
  endEstimated?: boolean;
  placeId?: string;
};

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  latitude: number;
  longitude: number;
};

export type WrappedStats = {
  placesVisited: number;
  visits: number;
  distanceMiles: number;
  monthlyVisits: number[];
  topPlace?: Place;
  topPlaceVisits: number;
  topPlaceMinutes: number;
  favoriteCategory: PlaceCategory;
  mostActiveMonth: string;
  newPlaces: number;
  repeatPlaces: number;
  trackedMinutes: number;
  personality: string;
  categoryMinutes: Record<PlaceCategory, number>;
  placeVisitCounts: Record<string, number>;
  placeMinutes: Record<string, number>;
};
