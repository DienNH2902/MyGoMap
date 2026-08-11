"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  MAP_STYLE_URL,
  VIETNAM_CENTER,
  DEFAULT_MAP_ZOOM,
  POI_CATEGORIES,
} from "@/lib/constants";
import type { PlaceResult, RouteStop, RouteGeometry } from "@/lib/types";

const ROUTE_SOURCE_ID = "mygomap-route";
const ROUTE_LAYER_ID = "mygomap-route-line";

interface MapViewProps {
  start: PlaceResult | null;
  end: PlaceResult | null;
  route: RouteGeometry | null;
  stops: RouteStop[];
  activeStopId: string | null;
  onSelectStop: (stopId: string) => void;
}

/** Looks up the display color configured for a POI category, with a safe fallback. */
function colorForCategory(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.color ??
    "#FF6A1A"
  );
}

/**
 * Renders the MapLibre map itself: the free CARTO basemap, the drawn driving
 * route, start/end pins, numbered stop markers, and small colored dots for
 * every POI found near each stop (so the user can actually see where each
 * suggested trạm xăng / quán ăn / etc. is, not just read its name in a list).
 * Must only ever render on the client (see the dynamic import with
 * `ssr: false` in MapExperience).
 */
export function MapView({
  start,
  end,
  route,
  stops,
  activeStopId,
  onSelectStop,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const endpointMarkersRef = useRef<Marker[]>([]);
  const stopMarkersRef = useRef<Marker[]>([]);
  const poiMarkersRef = useRef<Marker[]>([]);

  // Initialize the map exactly once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [VIETNAM_CENTER.lon, VIETNAM_CENTER.lat],
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: {},
    });

    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw / update the route line whenever a new route is computed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyRoute = () => {
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: route?.coordinates ?? [] },
      };

      const existingSource = map.getSource(ROUTE_SOURCE_ID);
      if (existingSource && "setData" in existingSource) {
        (existingSource as GeoJSONSource).setData(geojson);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: geojson });
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: "line",
          source: ROUTE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#FF6A1A",
            "line-width": 5,
            "line-opacity": 0.9,
          },
        });
      }

      if (route && route.coordinates.length > 0) {
        const [first, ...rest] = route.coordinates;
        if (first) {
          const bounds = rest.reduce(
            (acc, coord) => acc.extend(coord),
            new LngLatBounds(first, first),
          );
          map.fitBounds(bounds, { padding: 80, duration: 800 });
        }
      }
    };

    if (map.isStyleLoaded()) {
      applyRoute();
    } else {
      map.once("load", applyRoute);
    }
  }, [route]);

  // Start (A) / end (B) markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    endpointMarkersRef.current.forEach((marker) => marker.remove());
    endpointMarkersRef.current = [];

    const endpoints: Array<{ place: PlaceResult; kind: "start" | "end" }> = [];
    if (start) endpoints.push({ place: start, kind: "start" });
    if (end) endpoints.push({ place: end, kind: "end" });

    endpoints.forEach(({ place, kind }) => {
      const el = document.createElement("div");
      el.className =
        kind === "start"
          ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-sm font-extrabold text-white shadow-md ring-2 ring-emerald-500/30 transition-transform hover:scale-110"
          : "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-rose-500 text-sm font-extrabold text-white shadow-md ring-2 ring-rose-500/30 transition-transform hover:scale-110";
      el.textContent = kind === "start" ? "A" : "B";

      const marker = new Marker({ element: el })
        .setLngLat([place.lon, place.lat])
        .addTo(map);
      endpointMarkersRef.current.push(marker);
    });
  }, [start, end]);

  // Numbered, clickable stop markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((marker) => marker.remove());
    stopMarkersRef.current = [];

    stops.forEach((stop) => {
      const el = document.createElement("button");
      el.type = "button";
      const isActive = stop.id === activeStopId;
      el.className = [
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-sm font-bold text-ink shadow-lg transition-transform",
        isActive ? "scale-125 bg-accent-gold" : "bg-primary",
      ].join(" ");
      el.textContent = String(stop.order);
      el.setAttribute("aria-label", `Điểm dừng ${stop.order}`);
      el.addEventListener("click", () => onSelectStop(stop.id));

      const marker = new Marker({ element: el })
        .setLngLat([stop.lon, stop.lat])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });
  }, [stops, activeStopId, onSelectStop]);

  // Small colored dots for every POI found near each stop, with a popup
  // showing name/category/address on click — this is what actually lets the
  // user SEE where each suggested place is, not just read its name in a list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    poiMarkersRef.current.forEach((marker) => marker.remove());
    poiMarkersRef.current = [];

    stops.forEach((stop) => {
      stop.pois.forEach((poi) => {
        const el = document.createElement("div");
        el.style.backgroundColor = colorForCategory(poi.category);
        el.className =
          "h-3.5 w-3.5 rounded-full border-2 border-white shadow-md cursor-pointer";
        el.setAttribute("aria-label", poi.name);

        const popup = new Popup({ offset: 12, closeButton: true }).setHTML(
          `<div style="font-family: inherit; max-width: 200px;">
             <strong style="display:block; margin-bottom:2px;">${escapeHtml(poi.name)}</strong>
             ${poi.address ? `<span style="font-size:12px; color:#555;">${escapeHtml(poi.address)}</span>` : ""}
           </div>`,
        );

        const marker = new Marker({ element: el })
          .setLngLat([poi.lon, poi.lat])
          .setPopup(popup)
          .addTo(map);
        poiMarkersRef.current.push(marker);
      });
    });
  }, [stops]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Minimal HTML-escaping for text we inject into a MapLibre Popup's innerHTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
