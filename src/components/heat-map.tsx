'use dom';

/**
 * Heatmap of where time was spent: grid cells from `buildHeatGrid`, drawn as
 * rectangles on the same OpenStreetMap tiles as the visits map. Plain Leaflet,
 * no heat plugin: cells are already aggregated, so each one is a single shape
 * with an exact count in its tooltip.
 *
 * An Expo DOM component like `visits-map.tsx`: inline on web, a webview on native.
 */

import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import type { HeatCell } from '@/lib/geo/heat-grid';
import { createBaseMap, mapStylesheet } from '@/lib/map/leaflet-base';

export interface HeatLegendColors {
  /** Legend text. */
  text: string;
  /** Legend card background. */
  surface: string;
}

interface Props {
  cells: HeatCell[];
  /** Sequential ramp, least to most. */
  palette: readonly string[];
  legend: HeatLegendColors;
  dark: boolean;
  /** The map re-fits to the data whenever this changes (e.g. the time range). */
  fitKey: string;
  dom?: import('expo/dom').DOMProps;
}

function colorFor(intensity: number, palette: readonly string[]): string {
  const index = Math.min(palette.length - 1, Math.floor(intensity * palette.length));
  return palette[Math.max(0, index)];
}

function legendStylesheet({ text, surface }: HeatLegendColors): string {
  return `
    .orbit-heat-legend { position: absolute; left: 12px; bottom: 24px; z-index: 1000;
      display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px;
      background: ${surface}; color: ${text}; font: 12px system-ui, -apple-system, sans-serif;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18); pointer-events: none; }
    .orbit-heat-legend .ramp { display: flex; gap: 2px; }
    .orbit-heat-legend .ramp span { width: 16px; height: 10px; border-radius: 2px; }
  `;
}

export default function HeatMap({ cells, palette, legend, dark, fitKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const { map, dispose } = createBaseMap(element, true);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    fittedKeyRef.current = null;
    return () => {
      dispose();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    for (const cell of cells) {
      const color = colorFor(cell.intensity, palette);
      L.rectangle(cell.bounds, {
        stroke: false,
        fillColor: color,
        fillOpacity: 0.35 + 0.5 * cell.intensity,
      })
        .bindTooltip(`${cell.count.toLocaleString()} ${cell.count === 1 ? 'fix' : 'fixes'}`, { direction: 'top' })
        .addTo(layer);
    }

    if (cells.length > 0 && fittedKeyRef.current !== fitKey) {
      const bounds = L.latLngBounds(cells.flatMap((c) => c.bounds));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
      fittedKeyRef.current = fitKey;
    }
  }, [cells, palette, fitKey]);

  return (
    <>
      <style>{mapStylesheet(dark) + legendStylesheet(legend)}</style>
      <div ref={containerRef} className="orbit-map" />
      <div className="orbit-heat-legend" aria-label="Heatmap legend: lighter to darker means fewer to more location fixes">
        <span>Fewer</span>
        <span className="ramp">
          {palette.map((color) => (
            <span key={color} style={{ background: color }} />
          ))}
        </span>
        <span>More</span>
      </div>
    </>
  );
}
