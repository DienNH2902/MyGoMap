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
  // MAP_STYLE_URL,
  VIETNAM_CENTER,
  DEFAULT_MAP_ZOOM,
  POI_CATEGORIES,
  SOVEREIGNTY_LABEL_TEXT,
  HOANG_SA_LOCATION,
  TRUONG_SA_LOCATION,
  type MapStyleId,
  MAP_STYLES,
  BIEN_DONG_LABEL_TEXT,
  BIEN_DONG_LOCATION,
} from "@/lib/constants";
import type {
  PlaceResult,
  RouteStop,
  RouteGeometry,
  PoiResult,
} from "@/lib/types";

const ROUTE_SOURCE_ID = "mygomap-route";
const ROUTE_LAYER_ID = "mygomap-route-line";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

const TRAFFIC_SOURCE_ID = "mygomap-traffic-flow";
const TRAFFIC_LAYER_ID = "mygomap-traffic-flow-layer";

type GenderTheme = "nam" | "nu" | "khac";

interface MapViewProps {
  start: PlaceResult | null;
  end: PlaceResult | null;
  route: RouteGeometry | null;
  stops: RouteStop[];
  activeStopId: string | null;
  onSelectStop: (stopId: string) => void;
  activePoiId: string | null;
  onSelectPoi: (poiId: string) => void;
  onSelectStartFromMap?: (place: PlaceResult) => void;
  onSelectEndFromMap?: (place: PlaceResult) => void;
  customStops: PlaceResult[];
  onSelectCustomStopFromMap?: (place: PlaceResult) => void;
  mapStyleId: MapStyleId;
  showTrafficLayer?: boolean;
  aroundPois?: PoiResult[];
  activeAroundPoiId?: string | null;
  onSelectAroundPoi?: (poiId: string | null) => void;
  onOpenAroundSearchFromMap?: (place: PlaceResult) => void;
}

const POI_FOCUS_ZOOM = 16;

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

function runWhenStyleReady(map: MapLibreMap, callback: () => void) {
  if (map.isStyleLoaded()) {
    callback();
    return;
  }

  const handleIdle = () => {
    if (!map.isStyleLoaded()) return;
    map.off("idle", handleIdle);
    callback();
  };

  map.on("idle", handleIdle);
}

function removeTrafficLayer(map: MapLibreMap) {
  if (map.getLayer(TRAFFIC_LAYER_ID)) {
    map.removeLayer(TRAFFIC_LAYER_ID);
  }

  if (map.getSource(TRAFFIC_SOURCE_ID)) {
    map.removeSource(TRAFFIC_SOURCE_ID);
  }
}

function addTrafficLayer(map: MapLibreMap) {
  removeTrafficLayer(map);

  map.addSource(TRAFFIC_SOURCE_ID, {
    type: "raster",
    tiles: ["/api/traffic/flow/{z}/{x}/{y}?style=relative0&tileSize=256"],
    tileSize: 256,
  });

  map.addLayer({
    id: TRAFFIC_LAYER_ID,
    type: "raster",
    source: TRAFFIC_SOURCE_ID,
    paint: {
      "raster-opacity": 0.99,
    },
  });
}

export function MapView({
  start,
  end,
  route,
  stops,
  activeStopId,
  onSelectStop,
  activePoiId,
  onSelectPoi,
  onSelectStartFromMap,
  onSelectEndFromMap,
  customStops,
  onSelectCustomStopFromMap,
  mapStyleId,
  showTrafficLayer = false,
  aroundPois = [],
  activeAroundPoiId = null,
  onSelectAroundPoi,
  onOpenAroundSearchFromMap,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const clickPopupRef = useRef<Popup | null>(null);
  const endpointMarkersRef = useRef<Marker[]>([]);
  const stopMarkersRef = useRef<Marker[]>([]);
  const customStopMarkersRef = useRef<Marker[]>([]);
  const searchAroundMarkerRef = useRef<Marker | null>(null);
  const poiMarkersRef = useRef<
    { id: string; dotEl: HTMLDivElement; marker: Marker }[]
  >([]);
  const aroundPoiMarkersRef = useRef<
    { id: string; dotEl: HTMLDivElement; marker: Marker }[]
  >([]);

  const sovereigntyMarkersRef = useRef<Marker[]>([]);

  const [gender, setGender] = useState<GenderTheme>("nam");

  const [styleReloadKey, setStyleReloadKey] = useState(0);

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const theme = getThemeStyles(gender);

  // Khai báo bản đồ
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLES[mapStyleId].url,
      center: [VIETNAM_CENTER.lon, VIETNAM_CENTER.lat],
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: {},
    });

    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    const geolocateControl = new GeolocateControl({
      positionOptions: {
        enableHighAccuracy: false, // Chuyển thành false để lấy vị trí nhanh qua Wi-Fi/IP/Cell, tránh treo GPS
        timeout: 10000, // Tối đa 10 giây nếu không lấy được sẽ nhả ra
        maximumAge: 300000, // Cho phép dùng vị trí trong cache tối đa 5 phút
      },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    });

    map.addControl(geolocateControl, "bottom-right");

    map.on("load", () => {
      geolocateControl.trigger();
      addSovereigntyLabels(map, sovereigntyMarkersRef);
    });

    mapRef.current = map;

    return () => {
      sovereigntyMarkersRef.current.forEach((marker) => marker.remove());
      sovereigntyMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    runWhenStyleReady(map, () => {
      if (showTrafficLayer) {
        addTrafficLayer(map);
      } else {
        removeTrafficLayer(map);
      }
    });

    return () => {
      if (!mapRef.current) return;
      removeTrafficLayer(mapRef.current);
    };
  }, [showTrafficLayer, mapStyleId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextStyleUrl = MAP_STYLES[mapStyleId].url;

    map.setStyle(nextStyleUrl);

    const handleStyleReady = () => {
      if (!map.isStyleLoaded()) return;

      addSovereigntyLabels(map, sovereigntyMarkersRef);
      setStyleReloadKey((prev) => prev + 1);

      map.off("idle", handleStyleReady);
    };

    map.on("idle", handleStyleReady);

    return () => {
      map.off("idle", handleStyleReady);
    };
  }, [mapStyleId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    customStopMarkersRef.current.forEach((marker) => marker.remove());
    customStopMarkersRef.current = [];

    customStops
      .filter(
        (stop) =>
          stop.label && Number.isFinite(stop.lat) && Number.isFinite(stop.lon),
      )
      .forEach((stop, index) => {
        const el = document.createElement("div");
        el.className =
          "flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-xs font-extrabold text-white shadow-md ring-2 ring-amber-500/30";
        el.textContent = String(index + 1);

        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat([stop.lon, stop.lat])
          .addTo(map);

        customStopMarkersRef.current.push(marker);
      });
  }, [customStops]);

  // Vẽ tuyến đường
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

    runWhenStyleReady(map, applyRoute);
  }, [route, theme.routeColor, mapStyleId, styleReloadKey]);

  // Marker điểm A - B
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

      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat([place.lon, place.lat])
        .addTo(map);
      endpointMarkersRef.current.push(marker);
    });
  }, [start, end, theme]);

  // Event Contextmenu chọn điểm trên bản đồ
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      (!onSelectStartFromMap &&
        !onSelectEndFromMap &&
        !onSelectCustomStopFromMap &&
        !onOpenAroundSearchFromMap)
    )
      return;

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

      const loadingPopup = new Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "320px",
      })
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
      container.style.padding = "8px 4px 4px 4px";
      container.style.width = "100%";

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

      if (onSelectCustomStopFromMap) {
        const btnStop = document.createElement("button");
        btnStop.type = "button";
        btnStop.textContent = "Thêm điểm dừng";
        btnStop.style.flex = "1";
        btnStop.style.padding = "6px 8px";
        btnStop.style.fontSize = "11px";
        btnStop.style.fontWeight = "600";
        btnStop.style.color = "#ffffff";
        btnStop.style.backgroundColor = "#f59e0b";
        btnStop.style.border = "none";
        btnStop.style.borderRadius = "6px";
        btnStop.style.cursor = "pointer";

        btnStop.addEventListener("click", () => {
          onSelectCustomStopFromMap(place);
          loadingPopup.remove();
        });

        btnGroup.appendChild(btnStop);
      }

      if (onOpenAroundSearchFromMap) {
        const btnAround = document.createElement("button");
        btnAround.type = "button";
        btnAround.textContent = "Tìm kiếm xung quanh";
        btnAround.style.flex = "1";
        btnAround.style.padding = "6px 8px";
        btnAround.style.fontSize = "11px";
        btnAround.style.fontWeight = "600";
        btnAround.style.color = "#ffffff";
        btnAround.style.backgroundColor = "#0ea5e9";
        btnAround.style.border = "none";
        btnAround.style.borderRadius = "6px";
        btnAround.style.cursor = "pointer";

        btnAround.addEventListener("click", () => {
          // 1. Xóa marker tìm kiếm xung quanh cũ nếu đã tồn tại
          if (searchAroundMarkerRef.current) {
            searchAroundMarkerRef.current.remove();
          }

          // 2. Tạo marker mới và lưu vào Ref
          searchAroundMarkerRef.current = new Marker({ anchor: "center" })
            .setLngLat([place.lon, place.lat])
            .addTo(map);

          onOpenAroundSearchFromMap(place);
          loadingPopup.remove();
        });

        btnGroup.appendChild(btnAround);
      }

      container.appendChild(btnGroup);
      loadingPopup.setDOMContent(container);
    };

    map.on("contextmenu", handleClick);
    return () => {
      map.off("contextmenu", handleClick);
    };
  }, [
    onSelectStartFromMap,
    onSelectEndFromMap,
    onSelectCustomStopFromMap,
    onOpenAroundSearchFromMap,
  ]);

  // Marker các Trạm Dừng (Stop Markers)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    stopMarkersRef.current.forEach((marker) => marker.remove());
    stopMarkersRef.current = [];

    // Không hiện marker số thứ tự (1, 2, 3...) cho các điểm dừng kiểu
    // "interval" (rải mỗi ~50km khi không chọn số điểm dừng cụ thể) — người
    // dùng không tự chọn các mốc này nên không cần biết vị trí "điểm dừng",
    // chỉ cần thấy chấm POI (cây xăng, quán ăn...) tìm được dọc đường thôi.
    stops
      .filter((stop) => stop.source !== "interval")
      .forEach((stop) => {
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

        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat([stop.lon, stop.lat])
          .addTo(map);
        stopMarkersRef.current.push(marker);
      });
  }, [stops, activeStopId, onSelectStop, theme]);

  // TẠO CÁC CHẤM POI (ĐÃ SỬA LỖI TÂM KHÔNG BỊ TRƯỢT/LỆCH VỊ TRÍ)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    poiMarkersRef.current.forEach(({ marker }) => marker.remove());
    poiMarkersRef.current = [];

    stops.forEach((stop) => {
      stop.pois.forEach((poi) => {
        // Container cố định kích thước 24x24px làm mốc neo chuẩn cho MapLibre
        const container = document.createElement("div");
        container.className =
          "w-6 h-6 flex items-center justify-center cursor-pointer pointer-events-auto";

        // Chấm dot thật nằm bên trong container
        const dotEl = document.createElement("div");
        dotEl.style.backgroundColor = colorForCategory(poi.category);
        dotEl.className =
          "h-3.5 w-3.5 rounded-full border-2 border-white shadow-md transition-all duration-300";
        dotEl.setAttribute("aria-label", poi.name);
        dotEl.setAttribute("role", "button");

        container.appendChild(dotEl);

        container.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectPoi(poi.id);
        });

        // anchor: "center" đảm bảo chính giữa Marker luôn đặt đúng tọa độ lon/lat
        const marker = new Marker({ element: container, anchor: "center" })
          .setLngLat([poi.lon, poi.lat])
          .addTo(map);

        poiMarkersRef.current.push({ id: poi.id, dotEl, marker });
      });
    });
  }, [stops, onSelectPoi]);

  // Cập nhật hiệu ứng Active cho Dot mà không làm hỏng tọa độ Marker
  useEffect(() => {
    poiMarkersRef.current.forEach(({ id, dotEl }) => {
      const isActive = id === activePoiId;
      if (isActive) {
        dotEl.className =
          "h-5 w-5 rounded-full border-2 border-white shadow-2xl ring-4 ring-white/80 scale-125 transition-all duration-300 z-50";
      } else {
        dotEl.className =
          "h-3.5 w-3.5 rounded-full border-2 border-white shadow-md transition-all duration-300";
      }
    });
  }, [activePoiId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    aroundPoiMarkersRef.current.forEach(({ marker }) => marker.remove());
    aroundPoiMarkersRef.current = [];

    aroundPois.forEach((poi) => {
      const container = document.createElement("div");
      container.className =
        "w-7 h-7 flex items-center justify-center cursor-pointer pointer-events-auto";

      const dotEl = document.createElement("div");
      dotEl.style.backgroundColor = colorForCategory(poi.category);
      dotEl.className =
        "h-4 w-4 rounded-full border-2 border-white shadow-lg ring-2 ring-sky-400/40 transition-all duration-300";
      dotEl.setAttribute("aria-label", poi.name);
      dotEl.setAttribute("role", "button");

      container.appendChild(dotEl);

      container.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelectAroundPoi?.(poi.id);
      });

      const marker = new Marker({ element: container, anchor: "center" })
        .setLngLat([poi.lon, poi.lat])
        .addTo(map);

      aroundPoiMarkersRef.current.push({ id: poi.id, dotEl, marker });
    });
  }, [aroundPois, onSelectAroundPoi]);

  useEffect(() => {
    aroundPoiMarkersRef.current.forEach(({ id, dotEl }) => {
      const isActive = id === activeAroundPoiId;

      dotEl.className = isActive
        ? "h-6 w-6 rounded-full border-2 border-white shadow-2xl ring-4 ring-sky-300/80 scale-125 transition-all duration-300"
        : "h-4 w-4 rounded-full border-2 border-white shadow-lg ring-2 ring-sky-400/40 transition-all duration-300";
    });
  }, [activeAroundPoiId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeAroundPoiId) return;

    const poi = aroundPois.find(
      (candidate) => candidate.id === activeAroundPoiId,
    );
    if (!poi) return;

    const flyToPoi = () => {
      map.flyTo({
        center: [poi.lon, poi.lat],
        zoom: Math.max(map.getZoom(), POI_FOCUS_ZOOM),
        duration: 900,
        essential: true,
      });
    };

    if (map.isStyleLoaded()) {
      flyToPoi();
    } else {
      map.once("load", flyToPoi);
    }
  }, [activeAroundPoiId, aroundPois]);

  // Zoom bản đồ vào POI được chọn
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activePoiId) return;

    const poi = stops
      .flatMap((stop) => stop.pois)
      .find((candidate) => candidate.id === activePoiId);
    if (!poi) return;

    const flyToPoi = () => {
      map.flyTo({
        center: [poi.lon, poi.lat],
        zoom: Math.max(map.getZoom(), POI_FOCUS_ZOOM),
        duration: 900,
        essential: true,
      });
    };

    if (map.isStyleLoaded()) {
      flyToPoi();
    } else {
      map.once("load", flyToPoi);
    }
  }, [activePoiId, stops]);

  // Hiệu ứng màu cho chủ đề khác
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

function hideSensitiveBaseMapLabels(map: MapLibreMap) {
  const style = map.getStyle();
  if (!style.layers) return;

  const sensitiveLayerNamePatterns = [
    "watername",
    "water-name",
    "water_name",
    "marine",
    "sea",
    "ocean",
    "place_label_other",
    "place-island",
    "island",
  ];

  style.layers.forEach((layer) => {
    if (layer.type !== "symbol") return;

    const layerId = layer.id.toLowerCase();
    const shouldHide = sensitiveLayerNamePatterns.some((pattern) =>
      layerId.includes(pattern),
    );

    if (!shouldHide) return;
    if (!map.getLayer(layer.id)) return;

    try {
      map.setLayoutProperty(layer.id, "visibility", "none");
    } catch {
      // Một số style provider có layer readonly/khác schema, bỏ qua để map không crash.
    }
  });
}
function addSovereigntyLabels(
  map: MapLibreMap,
  markersRef: { current: Marker[] },
) {
  hideSensitiveBaseMapLabels(map);

  markersRef.current.forEach((marker) => marker.remove());
  markersRef.current = [];

  const sovereigntyLocations = [HOANG_SA_LOCATION, TRUONG_SA_LOCATION];

  sovereigntyLocations.forEach((location) => {
    const el = document.createElement("div");
    el.className = "flex flex-col items-center gap-1 select-none";
    el.style.pointerEvents = "none";
    el.innerHTML = `
      <span style="
        white-space: nowrap;
        background-color: #f59e0b;
        color: #ffffff;
        font-weight: 700;
        font-size: 11px;
        line-height: 1.2;
        padding: 4px 8px;
        border-radius: 6px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      ">${escapeHtml(SOVEREIGNTY_LABEL_TEXT)}</span>
      <span style="
        display: block;
        height: 10px;
        width: 10px;
        border-radius: 9999px;
        background-color: #f59e0b;
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      "></span>
    `;

    const marker = new Marker({ element: el, anchor: "bottom" })
      .setLngLat([location.lon, location.lat])
      .addTo(map);

    markersRef.current.push(marker);
  });

  const seaLabelEl = document.createElement("div");
  seaLabelEl.className = "select-none";
  seaLabelEl.style.pointerEvents = "none";
  seaLabelEl.innerHTML = `
    <span style="
      white-space: nowrap;
      // background-color: rgba(14, 165, 233, 0.88);
      color: #ffffff;
      font-weight: 800;
      font-size: 16px;
      line-height: 1.2;
      letter-spacing: 0;
      padding: 6px 12px;
      // border-radius: 9999px;
      // box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    ">${escapeHtml(BIEN_DONG_LABEL_TEXT)}</span>
  `;

  const seaMarker = new Marker({ element: seaLabelEl, anchor: "center" })
    .setLngLat([BIEN_DONG_LOCATION.lon, BIEN_DONG_LOCATION.lat])
    .addTo(map);

  markersRef.current.push(seaMarker);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
