'use dom';

/**
 * Map of visits and the recent path, drawn with Leaflet on OpenStreetMap tiles.
 *
 * This is an Expo DOM component: it renders inline on web and inside a webview
 * on iOS/Android, so one implementation covers every platform without a native
 * maps SDK. Tiles come from OpenStreetMap today; the plan is to serve them from
 * our own OSM index alongside place resolution.
 */

import 'leaflet/dist/leaflet.css';

import { IS_DOM } from 'expo/dom';
import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { formatDuration, formatTime } from '@/lib/format';

export interface MapVisit {
  id: number;
  lat: number;
  lon: number;
  startTs: number;
  endTs: number;
  pointCount: number;
}

export interface MapFocus {
  lat: number;
  lon: number;
  zoom?: number;
}

export interface MapPalette {
  path: string;
  visit: string;
  visitStroke: string;
  focus: string;
}

interface Props {
  visits: MapVisit[];
  /** Recent trace as [lat, lon] pairs, oldest first. */
  path: [number, number][];
  focus?: MapFocus | null;
  dark: boolean;
  interactive?: boolean;
  colors: MapPalette;
  onSelectVisit?: (id: number) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}

const DEFAULT_CENTER: [number, number] = [30.6187, -96.3365];

function stylesheet(dark: boolean): string {
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

export default function VisitsMap({
  visits,
  path,
  focus = null,
  dark,
  interactive = true,
  colors,
  onSelectVisit,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const selectRef = useRef(onSelectVisit);

  useEffect(() => {
    selectRef.current = onSelectVisit;
  }, [onSelectVisit]);

  // Create the map once per container.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
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
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    fittedRef.current = false;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [interactive]);

  // Redraw the data layer whenever visits or the path change.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (path.length > 1) {
      L.polyline(path, { color: colors.path, weight: 3, opacity: 0.55 }).addTo(layer);
    }
    for (const visit of visits) {
      const hours = (visit.endTs - visit.startTs) / 3_600_000;
      const radius = Math.min(18, Math.max(7, 7 + Math.log2(1 + hours) * 3));
      const marker = L.circleMarker([visit.lat, visit.lon], {
        radius,
        color: colors.visitStroke,
        weight: 2,
        fillColor: colors.visit,
        fillOpacity: 0.9,
      }).addTo(layer);
      marker.bindTooltip(
        `${formatTime(visit.startTs)} – ${formatTime(visit.endTs)} · ${formatDuration(visit.endTs - visit.startTs)}`,
        { direction: 'top', offset: [0, -radius] },
      );
      marker.on('click', () => {
        void selectRef.current?.(visit.id);
      });
    }

    if (!fittedRef.current && !focus) {
      const everything: [number, number][] = [
        ...visits.map((v) => [v.lat, v.lon] as [number, number]),
        ...path,
      ];
      if (everything.length > 0) {
        map.fitBounds(L.latLngBounds(everything), { padding: [40, 40], maxZoom: 15 });
        fittedRef.current = true;
      }
    }
  }, [visits, path, colors, focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.setView([focus.lat, focus.lon], focus.zoom ?? 16);
  }, [focus]);

  return (
    <>
      <style>{stylesheet(dark)}</style>
      <div ref={containerRef} className="orbit-map" />
    </>
  );
}
