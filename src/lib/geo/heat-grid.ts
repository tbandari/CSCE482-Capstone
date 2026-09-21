/**
 * Bins location fixes into roughly square cells for the heatmap.
 *
 * The grid is anchored to the globe, not to the data: rows are fixed bands of
 * latitude and each row's column width is set at that row's latitude. Adding
 * a point never moves a cell edge, so the heatmap stays stable as history grows
 * and two time ranges of the same data line up exactly.
 */

import { isValidCoordinate, offsetMeters, type LatLon } from '@/lib/geo/distance';

export interface HeatCell {
  /** Center of the cell. */
  lat: number;
  lon: number;
  /** [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]];
  count: number;
  /** log1p(count) / log1p(max), in 0..1. Log scale so home doesn't wash out everything else. */
  intensity: number;
}

export interface HeatGrid {
  /** Cells ordered coolest first, so the hottest ones draw on top. */
  cells: HeatCell[];
  /** Largest count of any cell; 0 when there are no points. */
  max: number;
}

function cellDegrees(lat: number, cellMeters: number): { dLat: number; dLon: number } {
  const corner = offsetMeters({ lat, lon: 0 }, cellMeters, cellMeters);
  return { dLat: corner.lat - lat, dLon: corner.lon };
}

export function buildHeatGrid(points: readonly LatLon[], cellMeters = 150): HeatGrid {
  if (!(cellMeters > 0)) throw new Error('buildHeatGrid: cellMeters must be positive');

  const { dLat } = cellDegrees(0, cellMeters);
  const counts = new Map<string, { row: number; col: number; count: number }>();
  for (const p of points) {
    if (!isValidCoordinate(p.lat, p.lon)) continue;
    const row = Math.floor(p.lat / dLat);
    const { dLon } = cellDegrees((row + 0.5) * dLat, cellMeters);
    const col = Math.floor(p.lon / dLon);
    const key = `${row}:${col}`;
    const cell = counts.get(key);
    if (cell) cell.count += 1;
    else counts.set(key, { row, col, count: 1 });
  }

  let max = 0;
  for (const cell of counts.values()) max = Math.max(max, cell.count);

  const cells = [...counts.values()]
    .sort((a, b) => a.count - b.count || a.row - b.row || a.col - b.col)
    .map(({ row, col, count }): HeatCell => {
      const south = row * dLat;
      const north = south + dLat;
      const { dLon } = cellDegrees(south + dLat / 2, cellMeters);
      const west = col * dLon;
      const east = west + dLon;
      return {
        lat: (south + north) / 2,
        lon: (west + east) / 2,
        bounds: [
          [south, west],
          [north, east],
        ],
        count,
        intensity: Math.log1p(count) / Math.log1p(max),
      };
    });

  return { cells, max };
}
