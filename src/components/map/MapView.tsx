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
  onSelectStartFromMap?: (place: PlaceResult) => void;
  onSelectEndFromMap?: (place: PlaceResult) => void;
}

function colorForCategory(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.color ??
    "#FF6A1A"
  );
}

function getThemeStyles(gender: GenderTheme) {
  if (gender === "nu") {
    return {
      routeColor: "#EC4899",
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
      routeColor: "#8B5CF6",
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

  return {
    routeColor: "#FF6A1A",
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
  onSelectStartFromMap,
  onSelectEndFromMap,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const clickPopupRef = useRef<Popup | null>(null);
  const endpointMarkersRef = useRef<Marker[]>([]);
  const stopMarkersRef = useRef<Marker[]>([]);
  const poiMarkersRef = useRef<Marker[]>([]);

  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const theme = getThemeStyles(gender);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [VIETNAM_CENTER.lon, VIETNAM_CENTER.lat],
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: {},
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const geolocateControl = new GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
      },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    });

    map.addControl(geolocateControl, "top-right");

    map.on("load", () => {
      geolocateControl.trigger();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Xử lý sự kiện click bản đồ: Hiển thị Popup lựa chọn làm điểm A hoặc B
  useEffect(() => {
    const map = mapRef.current;
    if (!map || (!onSelectStartFromMap && !onSelectEndFromMap)) return;

    let abortController: AbortController | null = null;

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;

      if (clickPopupRef.current) {
        clickPopupRef.current.remove();
      }

      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      const loadingPopup = new Popup({ closeButton: true, closeOnClick: true })
        .setLngLat([lng, lat])
        .setHTML(
          `<div style="padding: 4px; font-size: 12px; color: #666;">Đang lấy thông tin vị trí…</div>`,
        )
        .addTo(map);

      clickPopupRef.current = loadingPopup;

      let label = `Tọa độ: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
          { signal: abortController.signal },
        );
        const data = await res.json();
        if (data.display_name) {
          label = data.display_name;
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
      }

      const place: PlaceResult = {
        id: `map-click-${Date.now()}`,
        label,
        lat,
        lon: lng,
      };

      const container = document.createElement("div");
      container.style.padding = "4px";
      container.style.maxWidth = "220px";

      const titleEl = document.createElement("p");
      titleEl.style.fontSize = "12px";
      titleEl.style.fontWeight = "600";
      titleEl.style.marginBottom = "8px";
      titleEl.style.color = "#1e293b";
      titleEl.style.lineHeight = "1.3";
      titleEl.textContent = label;
      container.appendChild(titleEl);

      const btnGroup = document.createElement("div");
      btnGroup.style.display = "flex";
      btnGroup.style.gap = "6px";

      if (onSelectStartFromMap) {
        const btnStart = document.createElement("button");
        btnStart.type = "button";
        btnStart.textContent = "Chọn làm Điểm Bắt Đầu";
        btnStart.style.flex = "1";
        btnStart.style.padding = "6px 8px";
        btnStart.style.fontSize = "11px";
        btnStart.style.fontWeight = "600";
        btnStart.style.color = "#ffffff";
        btnStart.style.backgroundColor = "#10b981";
        btnStart.style.border = "none";
        btnStart.style.borderRadius = "6px";
        btnStart.style.cursor = "pointer";

        btnStart.addEventListener("click", () => {
          onSelectStartFromMap(place);
          loadingPopup.remove();
        });
        btnGroup.appendChild(btnStart);
      }

      if (onSelectEndFromMap) {
        const btnEnd = document.createElement("button");
        btnEnd.type = "button";
        btnEnd.textContent = "Chọn làm Điểm Kết Thúc";
        btnEnd.style.flex = "1";
        btnEnd.style.padding = "6px 8px";
        btnEnd.style.fontSize = "11px";
        btnEnd.style.fontWeight = "600";
        btnEnd.style.color = "#ffffff";
        btnEnd.style.backgroundColor = "#f43f5e";
        btnEnd.style.border = "none";
        btnEnd.style.borderRadius = "6px";
        btnEnd.style.cursor = "pointer";

        btnEnd.addEventListener("click", () => {
          onSelectEndFromMap(place);
          loadingPopup.remove();
        });
        btnGroup.appendChild(btnEnd);
      }

      container.appendChild(btnGroup);
      loadingPopup.setDOMContent(container);
    };

    map.on("contextmenu", handleClick);
    return () => {
      map.off("contextmenu", handleClick);
    };
  }, [onSelectStartFromMap, onSelectEndFromMap]);

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
