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

import L from 'leaflet';
import { useEffect, useRef } from 'react';

import { formatDuration, formatTime } from '@/lib/format';
import { createBaseMap, mapStylesheet } from '@/lib/map/leaflet-base';

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
    const { map, dispose } = createBaseMap(element, interactive);
    const layer = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layer;
    fittedRef.current = false;
    return () => {
      dispose();
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
      <style>{mapStylesheet(dark)}</style>
      <div ref={containerRef} className="orbit-map" />
    </>
  );
}
