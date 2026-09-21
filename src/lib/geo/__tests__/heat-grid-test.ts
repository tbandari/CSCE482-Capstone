import { haversineMeters, offsetMeters } from '@/lib/geo/distance';
import { buildHeatGrid } from '@/lib/geo/heat-grid';

const EVANS = { lat: 30.616, lon: -96.3393 };
const ZACHRY = { lat: 30.6212, lon: -96.3403 };

describe('buildHeatGrid', () => {
  test('empty input gives an empty grid', () => {
    expect(buildHeatGrid([])).toEqual({ cells: [], max: 0 });
  });

  test('a single point is one full-intensity cell that contains it', () => {
    const { cells, max } = buildHeatGrid([EVANS]);
    expect(max).toBe(1);
    expect(cells).toHaveLength(1);
    const [cell] = cells;
    expect(cell.count).toBe(1);
    expect(cell.intensity).toBe(1);
    const [[south, west], [north, east]] = cell.bounds;
    expect(south).toBeLessThanOrEqual(EVANS.lat);
    expect(north).toBeGreaterThan(EVANS.lat);
    expect(west).toBeLessThanOrEqual(EVANS.lon);
    expect(east).toBeGreaterThan(EVANS.lon);
  });

  test('cells are roughly cellMeters on a side', () => {
    const [cell] = buildHeatGrid([EVANS], 150).cells;
    const [[south, west], [north, east]] = cell.bounds;
    expect(haversineMeters(south, west, north, west)).toBeCloseTo(150, -1);
    expect(haversineMeters(south, west, south, east)).toBeCloseTo(150, -1);
  });

  test('nearby points share a cell and a point across a boundary does not', () => {
    const [cell] = buildHeatGrid([EVANS]).cells;
    const [[south, west], [north]] = cell.bounds;
    const inside = { lat: (south + north) / 2, lon: west + 1e-7 };
    const justAcross = { lat: north + 1e-7, lon: west + 1e-7 };

    const grid = buildHeatGrid([EVANS, inside, justAcross]);
    expect(grid.cells.map((c) => c.count).sort()).toEqual([1, 2]);
  });

  test('intensity is log-scaled into 0..1 and the busiest cell is 1', () => {
    const points = [...Array(99).fill(EVANS), ZACHRY];
    const { cells, max } = buildHeatGrid(points);
    expect(max).toBe(99);
    const zachry = cells.find((c) => c.count === 1)!;
    expect(zachry.intensity).toBeCloseTo(Math.log1p(1) / Math.log1p(99));
    for (const c of cells) {
      expect(c.intensity).toBeGreaterThan(0);
      expect(c.intensity).toBeLessThanOrEqual(1);
    }
    expect(cells.at(-1)!.intensity).toBe(1); // hottest last so it draws on top
  });

  test('invalid fixes are ignored', () => {
    const { cells } = buildHeatGrid([{ lat: 0, lon: 0 }, { lat: 91, lon: 0 }, { lat: NaN, lon: 1 }, EVANS]);
    expect(cells).toHaveLength(1);
  });

  test('the output is deterministic and independent of input order', () => {
    const points = Array.from({ length: 200 }, (_, i) => offsetMeters(EVANS, (i % 17) * 40, (i % 11) * 55));
    const forward = buildHeatGrid(points);
    expect(buildHeatGrid(points)).toEqual(forward);
    expect(buildHeatGrid([...points].reverse())).toEqual(forward);
  });

  test('cell edges do not move when unrelated points are added', () => {
    const alone = buildHeatGrid([EVANS]).cells[0].bounds;
    const withOthers = buildHeatGrid([EVANS, ZACHRY, offsetMeters(EVANS, 5000, 5000)]).cells.find(
      (c) => c.bounds[0][0] <= EVANS.lat && EVANS.lat < c.bounds[1][0] && c.bounds[0][1] <= EVANS.lon && EVANS.lon < c.bounds[1][1],
    )!.bounds;
    expect(withOthers).toEqual(alone);
  });

  test('rejects a non-positive cell size', () => {
    expect(() => buildHeatGrid([EVANS], 0)).toThrow();
  });
});
