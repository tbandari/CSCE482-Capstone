/**
 * Shared Leaflet setup for Orbit's map DOM components (visits map, heatmap):
 * the same OpenStreetMap tiles, default view and light/dark styling everywhere.
 *
 * Only import this from `'use dom'` components. Leaflet needs `window`, which
 * exists on web and inside the native webview but not in the native JS runtime.
 */

import { IS_DOM } from 'expo/dom';
import L from 'leaflet';

export const DEFAULT_CENTER: [number, number] = [30.6187, -96.3365];

export function mapStylesheet(dark: boolean): string {
  const page = IS_DOM
    ? `html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: ${dark ? '#0B0D12' : '#F3F4F7'}; }`
    : '';
  const darkTiles = dark
    ? `.orbit-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9) saturate(0.7); }
       .orbit-map .leaflet-control-attribution { background: rgba(11, 13, 18, 0.75); color: #A6ADBA; }
       .orbit-map .leaflet-control-attribution a { color: #60A5FA; }
       .orbit-map .leaflet-tooltip { background: #171A21; color: #F5F7FA; border-color: #262B35; }`
    : '';
  return `
    ${page}
    .orbit-map { position: absolute; inset: 0; background: ${dark ? '#0B0D12' : '#F3F4F7'}; }
    .orbit-map .leaflet-container { font-family: system-ui, -apple-system, sans-serif; background: inherit; }
    .orbit-map .leaflet-control-attribution { font-size: 10px; }
    .orbit-map .leaflet-tooltip { border-radius: 8px; font-size: 12px; padding: 4px 8px; }
    ${darkTiles}
  `;
}

/**
 * Creates a map with Orbit's tiles in `element`. Returns a cleanup function
 * that also stops resizing it.
 */
export function createBaseMap(element: HTMLElement, interactive: boolean): { map: L.Map; dispose: () => void } {
  const map = L.map(element, {
    zoomControl: false,
    attributionControl: true,
    dragging: interactive,
    scrollWheelZoom: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
  });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.setView(DEFAULT_CENTER, 12);

  const observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(element);
  return {
    map,
    dispose: () => {
      observer.disconnect();
      map.remove();
    },
  };
}
