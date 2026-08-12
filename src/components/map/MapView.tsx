"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  Popup,
  NavigationControl,
  LngLatBounds,
  type GeoJSONSource,
  GeolocateControl,
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
const STORAGE_KEY_GENDER = "mygomap_user_gender";

type GenderTheme = "nam" | "nu" | "khac";

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

/** Configures theme colors based on user gender from localStorage */
function getThemeStyles(gender: GenderTheme) {
  if (gender === "nu") {
    return {
      routeColor: "#EC4899", // Pink
      startBg: "bg-fuchsia-500",
      startRing: "ring-fuchsia-500/30",
      endBg: "bg-pink-600",
      endRing: "ring-pink-600/30",
      stopBg: "bg-pink-500",
      stopActiveBg: "bg-purple-600 text-white",
    };
  }

  if (gender === "khac") {
    return {
      routeColor: "#8B5CF6", // Purple Base Line
      startBg: "bg-gradient-to-r from-red-500 via-yellow-500 to-green-500",
      startRing: "ring-purple-500/30",
      endBg: "bg-gradient-to-r from-blue-500 via-indigo-500 to-pink-500",
      endRing: "ring-pink-500/30",
      stopBg:
        "bg-gradient-to-r from-amber-400 via-rose-400 to-violet-500 text-white",
      stopActiveBg:
        "bg-gradient-to-r from-emerald-400 via-cyan-500 to-blue-600 text-white",
    };
  }

  // Nam (Default)
  return {
    routeColor: "#FF6A1A", // Orange
    startBg: "bg-emerald-500",
    startRing: "ring-emerald-500/30",
    endBg: "bg-rose-500",
    endRing: "ring-rose-500/30",
    stopBg: "bg-primary",
    stopActiveBg: "bg-accent-gold",
  };
}

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

  const [gender, setGender] = useState<GenderTheme>("nam");

  // Read gender from localStorage on mount
  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const theme = getThemeStyles(gender);

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

    // Tạo bộ định vị vị trí hiện tại và cập nhật realtime khi di chuyển
    const geolocateControl = new GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true, // Bật GPS độ chính xác cao
      },
      trackUserLocation: true, // Theo dõi và tự động cập nhật tâm bản đồ khi di chuyển
      showUserLocation: true, // Hiển thị điểm chấm tròn định vị người dùng
      showAccuracyCircle: true, // Hiển thị vòng bán kính sai số GPS
    });

    map.addControl(geolocateControl, "bottom-right");

    // Tự động kích hoạt định vị ngay khi bản đồ tải xong
    map.on("load", () => {
      geolocateControl.trigger();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw / update the route line whenever a new route or gender theme changes.
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
            "line-color": theme.routeColor,
            "line-width": 3,
            "line-opacity": 0.9,
          },
        });
      }

      // Update layer color if theme changes
      if (map.getLayer(ROUTE_LAYER_ID)) {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", theme.routeColor);
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
  }, [route, theme.routeColor]);

  // Start (A) / end (B) markers with dynamic gender styling.
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
      const isStart = kind === "start";

      const bgClass = isStart ? theme.startBg : theme.endBg;
      const ringClass = isStart ? theme.startRing : theme.endRing;

      el.className = `flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-sm font-extrabold text-white shadow-md ring-2 ${bgClass} ${ringClass} transition-transform hover:scale-110`;
      el.textContent = isStart ? "A" : "B";

      const marker = new Marker({ element: el })
        .setLngLat([place.lon, place.lat])
        .addTo(map);
      endpointMarkersRef.current.push(marker);
    });
  }, [start, end, theme]);

  // Numbered, clickable stop markers with dynamic gender styling.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((marker) => marker.remove());
    stopMarkersRef.current = [];

    stops.forEach((stop) => {
      const el = document.createElement("button");
      el.type = "button";
      const isActive = stop.id === activeStopId;
      const bgClass = isActive ? theme.stopActiveBg : theme.stopBg;

      el.className = [
        "flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-sm font-bold shadow-lg transition-transform",
        isActive ? "scale-125" : "",
        bgClass,
      ].join(" ");

      el.textContent = String(stop.order);
      el.setAttribute("aria-label", `Điểm dừng ${stop.order}`);
      el.addEventListener("click", () => onSelectStop(stop.id));

      const marker = new Marker({ element: el })
        .setLngLat([stop.lon, stop.lat])
        .addTo(map);
      stopMarkersRef.current.push(marker);
    });
  }, [stops, activeStopId, onSelectStop, theme]);

  // Small colored dots for POIs near stops
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

  // Thêm useEffect xử lý animation đổi màu riêng cho giới tính "Khac"
  useEffect(() => {
    const map = mapRef.current;
    if (!map || gender !== "khac") return;

    let hue = 0;
    let animationFrameId: number;

    const animateRouteColor = () => {
      hue = (hue + 1) % 360;
      const dynamicColor = `hsl(${hue}, 90%, 60%)`;

      if (map.getLayer(ROUTE_LAYER_ID)) {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", dynamicColor);
      }

      animationFrameId = requestAnimationFrame(animateRouteColor);
    };

    animateRouteColor();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [gender, route]);

  return <div ref={containerRef} className="h-full w-full" />;
}

/** Minimal HTML-escaping for text injected into MapLibre Popup's innerHTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
