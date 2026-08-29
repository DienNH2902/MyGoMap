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
import maplibregl from "maplibre-gl";
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
  MAX_CUSTOM_STOPS,
  VIETNAM_SOVEREIGNTY_STOPS,
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
  /** Called with a friendly Vietnamese message whenever geolocation fails (permission denied, timeout, insecure origin) — see the GeolocateControl "error" handler above. */
  onLocationError?: (message: string) => void;
  /** Called when map is ready (for external ref access) */
  onMapReady?: (map: MapLibreMap) => void;
  /**
   * true khi đang trong chế độ dẫn đường thời gian thực (đã bấm "Về giữa").
   * Lúc này `route` không còn là tuyến A→B tĩnh nữa mà được cha component
   * (MapExperience) truyền vào là lộ trình TÍNH LẠI liên tục từ vị trí hiện
   * tại của người dùng đến đích — nên bản đồ KHÔNG được tự ý fitBounds/zoom
   * ra để "khoe" toàn tuyến mỗi khi route đổi (việc zoom/camera lúc này do
   * useNavigationTracking chủ động điều khiển theo GPS), và cũng không chia
   * màu theo từng chặng dừng như lúc lập kế hoạch. Mặc định false để mọi
   * hành vi cũ (không navigate) giữ nguyên 100%.
   */
  isNavigating?: boolean;
  onNavigateToMapPoint?: (place: PlaceResult) => void;
  isQuickSearch?: boolean;
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
      endRing: "ring-pink-600/30",
      stopBg:
        "bg-gradient-to-r from-amber-400 via-rose-400 to-violet-500 text-white",
      stopActiveBg:
        "bg-gradient-to-r from-emerald-400 via-cyan-500 to-blue-600 text-white",
    };
  }

  return {
    // routeColor: "#FF6A1A",
    routeColor: "#2563EB",
    startBg: "bg-emerald-500",
    startRing: "ring-emerald-500/30",
    endBg: "bg-rose-500",
    endRing: "ring-rose-500/30",
    stopBg: "bg-primary",
    stopActiveBg: "bg-accent-gold",
  };
}

function getSegmentColorsByGender(gender: GenderTheme): string[] {
  if (gender === "nam") {
    return [
      "#2563EB", // Xanh dương đậm (Royal Blue) - Nam tính, rõ nét
      "#16A34A", // Xanh lá cây (Emerald Green) - Tương phản tốt với xanh dương
      "#EA580C", // Cam cháy (Burnt Orange) - Nổi bật
      "#0891B2", // Xanh ngọc biển (Cyan / Dark Teal)
      "#9333EA", // Tím đậm (Deep Violet)
      "#DC2626", // Đỏ tươi (Bright Red)
      "#D97706", // Vàng hổ phách (Amber Gold)
    ];
  }

  if (gender === "nu") {
    return [
      "#EC4899", // Hồng cánh sen tươi (Hot Pink) - Rất nổi bật
      "#7C3AED", // Tím đậm / Tím hoa đậu biệp (Deep Violet) - Tương phản mạnh với hồng
      "#F43F5E", // Đỏ hồng san hô (Rose Red) - Thiên về tone ấm
      "#A855F7", // Tím tươi (Bright Purple) - Chuẩn sắc tím
      "#FB7185", // Hồng phấn / Hồng pastel (Soft Pink) - Sắc độ sáng nhẹ
      "#4C1D95", // Tím thẫm / Tím mận (Dark Plum) - Tone tối đậm
      "#E879F9", // Tím hồng ngọc (Orchid Pink) - Sắc độ rực rỡ
    ];
  }

  // "khac"
  return [
    "#8B5CF6", // Tím
    "#06B6D4", // Xanh ngọc
    "#10B981", // Xanh lá
    "#F59E0B", // Vàng cam
    "#EC4899", // Hồng
    "#3B82F6", // Xanh dương
    "#F97316", // Cam
  ];
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

  // Ensure route layer stays on top of traffic layer
  if (map.getLayer(ROUTE_LAYER_ID)) {
    map.moveLayer(ROUTE_LAYER_ID);
  }
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
  onLocationError,
  onMapReady,
  onNavigateToMapPoint,
  isNavigating = false,
  isQuickSearch = false,
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

  const previousRouteCoordsRef = useRef<string | null>(null);

  const sovereigntyMarkersRef = useRef<Marker[]>([]);

  const [gender, setGender] = useState<GenderTheme>("nam");

  const [styleReloadKey, setStyleReloadKey] = useState(0);

  const activeSegmentLayersRef = useRef<string[]>([]);

  // Khi đang ở chế độ dẫn đường (isNavigating), useNavigationTracking đã tự
  // vẽ marker mũi tên riêng (kèm vùng báo hướng) — nếu để nguyên, chấm định
  // vị + vòng tròn độ chính xác + kim la bàn mặc định của GeolocateControl
  // (MapLibre) vẫn hiển thị song song, gây ra tình trạng "2 chấm cùng lúc"
  // rất rối như phản ánh. Effect này chỉ ẩn/hiện chúng bằng CSS theo
  // isNavigating — KHÔNG đụng vào cấu hình/logic của GeolocateControl phía
  // trên (trackUserLocation, showUserLocation... giữ nguyên 100%), nên lúc
  // không navigate (duyệt bản đồ bình thường) chấm định vị gốc vẫn hoạt
  // động y như cũ.
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-mygomap-nav-dot-toggle", "true");
    styleEl.textContent = `
      .mygomap-hide-native-locate-dot .maplibregl-user-location-dot,
      .mygomap-hide-native-locate-dot .maplibregl-user-location-accuracy-circle,
      .mygomap-hide-native-locate-dot .maplibregl-user-location-heading {
        display: none !important;
      }
    `;
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();
    container.classList.toggle("mygomap-hide-native-locate-dot", isNavigating);
  }, [isNavigating]);

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
      attributionControl: false,
    });

    map.addControl(
      new NavigationControl({ showCompass: false }),
      "bottom-right",
    );

    const geolocateControl = new GeolocateControl({
      positionOptions: {
        // Bật GPS thật (chip GPS trên điện thoại) thay vì chỉ định vị theo
        // Wi-Fi/mạng. Trên desktop (không có GPS) trình duyệt tự động dùng
        // phương án tốt nhất sẵn có nên không bị ảnh hưởng — nhưng trên
        // mobile, false trước đây đã bỏ phí GPS thật (nhanh + chính xác hơn
        // nhiều ngoài trời), khiến định vị mobile chậm/kém tin cậy hơn hẳn.
        enableHighAccuracy: true,
        timeout: 10000, // Tối đa 10 giây nếu không lấy được sẽ nhả ra, tránh treo vô hạn
        maximumAge: 5000, // Cho phép dùng vị trí cache tối đa 5 giây (giảm từ 300000ms)
      },
      trackUserLocation: true,
      showUserLocation: true,
      showAccuracyCircle: true,
    });

    // Trước đây khi định vị lỗi (bị từ chối quyền, timeout, hay trang chạy
    // qua HTTP không an toàn) thì KHÔNG có gì hiển thị cho người dùng biết —
    // nhìn như "định vị không hoạt động" mà không rõ lý do. Bắt lỗi cụ thể
    // và báo rõ ràng, đặc biệt quan trọng trên mobile vì lỗi hay gặp nhất ở
    // đó là bị từ chối quyền vị trí và KHÔNG THỂ tự xin lại bằng JS được nữa
    // — người dùng cần biết để tự vào cài đặt trình duyệt bật lại.
    geolocateControl.on("error", (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        onLocationError?.(
          "Bạn đã từ chối quyền truy cập vị trí. Vào Cài đặt trình duyệt → Quyền riêng tư/Vị trí để bật lại cho trang này.",
        );
      } else if (error.code === error.TIMEOUT) {
        onLocationError?.(
          "Không lấy được vị trí (quá thời gian chờ). Hãy đảm bảo đã bật Dịch vụ vị trí trên thiết bị rồi thử lại.",
        );
      } else {
        onLocationError?.(
          "Không thể xác định vị trí hiện tại của bạn lúc này.",
        );
      }
    });

    map.addControl(geolocateControl, "bottom-right");

    map.on("load", () => {
      // Geolocation API chỉ hoạt động trên "secure context" (HTTPS, hoặc
      // localhost khi phát triển). Nếu ai đó mở trang qua địa chỉ IP LAN nội
      // bộ bằng HTTP để test trên điện thoại (rất hay gặp), trình duyệt
      // mobile sẽ chặn định vị hoàn toàn — trong khi trên máy tính test qua
      // "localhost" thì KHÔNG bị chặn, nên tưởng nhầm là "chỉ mobile mới
      // lỗi". Kiểm tra rõ và báo luôn nguyên nhân thay vì để trigger() thất
      // bại trong im lặng.
      if (typeof window !== "undefined" && !window.isSecureContext) {
        onLocationError?.(
          "Trình duyệt yêu cầu kết nối HTTPS (hoặc localhost) để dùng định vị. Vui lòng truy cập trang qua địa chỉ https://…",
        );
      } else {
        geolocateControl.trigger();
      }
      addSovereigntyLabels(map, sovereigntyMarkersRef);
    });

    mapRef.current = map;

    // Notify parent component that map is ready
    onMapReady?.(map);

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

    const clearSegmentLayers = () => {
      activeSegmentLayersRef.current.forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.removeLayer(layerId);
        }
        const sourceId = layerId.replace("-layer", "-source");
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }
      });
      activeSegmentLayersRef.current = [];
    };

    const applyRoute = () => {
      const coords = route?.coordinates ?? [];

      if (
        isNavigating &&
        coords.length > 1 &&
        activeSegmentLayersRef.current.length > 0
      ) {
        const breakPoints: [number, number][] = [];

        if (start && Number.isFinite(start.lon) && Number.isFinite(start.lat)) {
          breakPoints.push([start.lon, start.lat]);
        }

        stops
          .filter((stop) => stop.source !== "interval")
          .forEach((stop) => {
            if (Number.isFinite(stop.lon) && Number.isFinite(stop.lat)) {
              breakPoints.push([stop.lon, stop.lat]);
            }
          });

        customStops.forEach((stop) => {
          if (Number.isFinite(stop.lon) && Number.isFinite(stop.lat)) {
            breakPoints.push([stop.lon, stop.lat]);
          }
        });

        if (end && Number.isFinite(end.lon) && Number.isFinite(end.lat)) {
          breakPoints.push([end.lon, end.lat]);
        }

        if (breakPoints.length > 1) {
          const findClosestIndex = (pt: [number, number]): number => {
            let minDistanceSq = Infinity;
            let closestIndex = 0;

            for (let i = 0; i < coords.length; i++) {
              const coord = coords[i];
              if (!coord) continue;

              const dx = coord[0] - pt[0];
              const dy = coord[1] - pt[1];
              const distSq = dx * dx + dy * dy;

              if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                closestIndex = i;
              }
            }

            return closestIndex;
          };

          const breakIndices = breakPoints
            .map(findClosestIndex)
            .sort((a, b) => a - b);

          const uniqueIndices = Array.from(new Set(breakIndices));
          const expectedSegmentCount = uniqueIndices.length - 1;

          if (
            expectedSegmentCount === activeSegmentLayersRef.current.length &&
            uniqueIndices.length > 1
          ) {
            for (let i = 0; i < expectedSegmentCount; i++) {
              const startIdx = uniqueIndices[i];
              const endIdx = uniqueIndices[i + 1];

              if (startIdx === undefined || endIdx === undefined) continue;

              const segmentCoords = coords.slice(startIdx, endIdx + 1);
              if (segmentCoords.length < 2) continue;

              const segmentSourceId = `mygomap-live-route-seg-source-${i}`;
              const source = map.getSource(segmentSourceId);

              if (source && "setData" in source) {
                const segGeojson: GeoJSON.Feature<GeoJSON.LineString> = {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: segmentCoords,
                  },
                };

                (source as GeoJSONSource).setData(segGeojson);
              }
            }

            return;
          }
        }
      }

      clearSegmentLayers();

      // Thu thập tất cả điểm dừng theo thứ tự tuyến đường
      const breakPoints: [number, number][] = [];
      if (start && Number.isFinite(start.lon) && Number.isFinite(start.lat)) {
        breakPoints.push([start.lon, start.lat]);
      }

      stops
        .filter((stop) => stop.source !== "interval")
        .forEach((stop) => {
          if (Number.isFinite(stop.lon) && Number.isFinite(stop.lat)) {
            breakPoints.push([stop.lon, stop.lat]);
          }
        });

      customStops.forEach((stop) => {
        if (Number.isFinite(stop.lon) && Number.isFinite(stop.lat)) {
          breakPoints.push([stop.lon, stop.lat]);
        }
      });

      if (end && Number.isFinite(end.lon) && Number.isFinite(end.lat)) {
        breakPoints.push([end.lon, end.lat]);
      }

      // Đảo bảo hoặc hạ cờ đường chính cơ bản
      const mainGeojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      };

      const existingSource = map.getSource(ROUTE_SOURCE_ID);
      if (existingSource && "setData" in existingSource) {
        (existingSource as GeoJSONSource).setData(mainGeojson);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: mainGeojson });

        if (map.getLayer(ROUTE_LAYER_ID)) {
          map.removeLayer(ROUTE_LAYER_ID);
        }

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

      // Đang dẫn đường thời gian thực: route ở đây là lộ trình được tính lại
      // liên tục từ vị trí hiện tại → đích, không còn khớp với các mốc dừng
      // đã lập kế hoạch (start/stops/end cũ) nữa, nên bỏ qua việc chia màu
      // từng chặng và chỉ hiển thị một đường màu chính duy nhất cho rõ ràng.
      if (isNavigating) {
        if (map.getLayer(ROUTE_LAYER_ID)) {
          map.setPaintProperty(ROUTE_LAYER_ID, "line-opacity", 0);
        }

        if (coords.length > 0 && breakPoints.length > 1) {
          const findClosestIndex = (pt: [number, number]): number => {
            let minDistanceSq = Infinity;
            let closestIndex = 0;

            for (let i = 0; i < coords.length; i++) {
              const coord = coords[i];
              if (!coord) continue;

              const dx = coord[0] - pt[0];
              const dy = coord[1] - pt[1];
              const distSq = dx * dx + dy * dy;

              if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                closestIndex = i;
              }
            }

            return closestIndex;
          };

          const breakIndices = breakPoints
            .map(findClosestIndex)
            .sort((a, b) => a - b);

          const uniqueIndices = Array.from(new Set(breakIndices));

          const palette = getSegmentColorsByGender(gender);

          for (let i = 0; i < uniqueIndices.length - 1; i++) {
            const segmentStartIndex = uniqueIndices[i];
            const segmentEndIndex = uniqueIndices[i + 1];

            if (
              segmentStartIndex === undefined ||
              segmentEndIndex === undefined
            ) {
              continue;
            }

            const segmentCoords = coords.slice(
              segmentStartIndex,
              segmentEndIndex + 1,
            );

            if (segmentCoords.length < 2) continue;

            const segmentSourceId = `mygomap-live-route-seg-source-${i}`;

            const segmentLayerId = `mygomap-live-route-seg-layer-${i}`;

            const color = palette[i % palette.length];

            const segGeojson: GeoJSON.Feature<GeoJSON.LineString> = {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: segmentCoords,
              },
            };

            map.addSource(segmentSourceId, {
              type: "geojson",
              data: segGeojson,
            });

            map.addLayer({
              id: segmentLayerId,
              type: "line",
              source: segmentSourceId,
              layout: {
                "line-cap": "round",
                "line-join": "round",
              },
              paint: {
                "line-color": color,
                "line-width": 10,
                "line-opacity": 1,
              },
            });

            activeSegmentLayersRef.current.push(segmentLayerId);

            if (map.getLayer(TRAFFIC_LAYER_ID)) {
              map.moveLayer(segmentLayerId);
            }
          }
        }

        return;
      }

      // Xử lý chia màu từng chặng nếu có các điểm dừng trên đường
      if (coords.length > 0 && breakPoints.length > 2) {
        const findClosestIndex = (pt: [number, number]): number => {
          let minDistanceSq = Infinity;
          let closestIndex = 0;

          for (let i = 0; i < coords.length; i++) {
            const coord = coords[i];
            if (!coord) continue; // Bỏ qua nếu phần tử không tồn tại

            const dx = coord[0] - pt[0];
            const dy = coord[1] - pt[1];
            const distSq = dx * dx + dy * dy;

            if (distSq < minDistanceSq) {
              minDistanceSq = distSq;
              closestIndex = i;
            }
          }

          return closestIndex;
        };

        const breakIndices = breakPoints
          .map(findClosestIndex)
          .sort((a, b) => a - b);

        const uniqueIndices = Array.from(new Set(breakIndices));

        if (uniqueIndices.length > 1) {
          // Bất hiển thị tuyến đường đơn sắc chính để thay bằng đa sắc
          if (map.getLayer(ROUTE_LAYER_ID)) {
            map.setPaintProperty(ROUTE_LAYER_ID, "line-opacity", 0);
          }

          const palette = getSegmentColorsByGender(gender);

          for (let i = 0; i < uniqueIndices.length - 1; i++) {
            const startIdx = uniqueIndices[i];
            const endIdx = uniqueIndices[i + 1];

            // Bỏ qua nếu 1 trong 2 chỉ số bị undefined
            if (startIdx === undefined || endIdx === undefined) continue;

            const segmentCoords = coords.slice(startIdx, endIdx + 1);

            if (segmentCoords.length < 2) continue;

            const segmentSourceId = `mygomap-route-seg-source-${i}`;
            const segmentLayerId = `mygomap-route-seg-layer-${i}`;
            const color = palette[i % palette.length];

            const segGeojson: GeoJSON.Feature<GeoJSON.LineString> = {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: segmentCoords,
              },
            };

            map.addSource(segmentSourceId, {
              type: "geojson",
              data: segGeojson,
            });

            map.addLayer({
              id: segmentLayerId,
              type: "line",
              source: segmentSourceId,
              layout: { "line-cap": "round", "line-join": "round" },
              paint: {
                "line-color": color,
                "line-width": 4,
                "line-opacity": 0.9,
              },
            });

            activeSegmentLayersRef.current.push(segmentLayerId);

            if (map.getLayer(TRAFFIC_LAYER_ID)) {
              map.moveLayer(segmentLayerId);
            }
          }
        } else if (map.getLayer(ROUTE_LAYER_ID)) {
          map.setPaintProperty(ROUTE_LAYER_ID, "line-opacity", 0.9);
          map.setPaintProperty(ROUTE_LAYER_ID, "line-color", theme.routeColor);
        }
      } else if (map.getLayer(ROUTE_LAYER_ID)) {
        map.setPaintProperty(ROUTE_LAYER_ID, "line-opacity", 0.9);
        map.setPaintProperty(ROUTE_LAYER_ID, "line-color", theme.routeColor);
      }

      // Ensure route layer is always above traffic layer
      if (map.getLayer(ROUTE_LAYER_ID) && map.getLayer(TRAFFIC_LAYER_ID)) {
        map.moveLayer(ROUTE_LAYER_ID);
      }

      // if (route && route.coordinates.length > 0) {
      //   const [first, ...rest] = route.coordinates;
      //   if (first) {
      //     const bounds = rest.reduce(
      //       (acc, coord) => acc.extend(coord),
      //       new LngLatBounds(first, first),
      //     );
      //     map.fitBounds(bounds, { padding: 80, duration: 800 });
      //   }
      // }

      // Chỉ fitBounds nếu TOÀN BỘ TUYẾN ĐƯỜNG MỚI ĐƯỢC TÍNH LẠI (thay đổi route.coordinates)
      // Nếu chỉ thêm customStops mà hình dáng tuyến đường chính không đổi thì bỏ qua zoom
      const currentCoordsString = JSON.stringify(route?.coordinates ?? []);

      if (route && route.coordinates.length > 0) {
        if (previousRouteCoordsRef.current !== currentCoordsString) {
          previousRouteCoordsRef.current = currentCoordsString;

          const [first, ...rest] = route.coordinates;
          if (first) {
            const bounds = rest.reduce(
              (acc, coord) => acc.extend(coord),
              new LngLatBounds(first, first),
            );
            map.fitBounds(bounds, { padding: 80, duration: 800 });
          }
        }
      }
    };

    runWhenStyleReady(map, applyRoute);
  }, [
    route,
    theme.routeColor,
    // mapStyleId,
    styleReloadKey,
    start,
    end,
    stops,
    customStops,
    gender,
    isNavigating,
    isQuickSearch,
  ]);

  // Marker điểm A - B
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    endpointMarkersRef.current.forEach((marker) => marker.remove());
    endpointMarkersRef.current = [];

    const endpoints: Array<{ place: PlaceResult; kind: "start" | "end" }> = [];

    if (!isQuickSearch && start) {
      endpoints.push({ place: start, kind: "start" });
    }

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
  }, [start, end, theme, isQuickSearch]);

  // Event Contextmenu chọn điểm trên bản đồ
  // Event Contextmenu / Long-press chọn điểm trên bản đồ
  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      (!onSelectStartFromMap &&
        !onSelectEndFromMap &&
        !onNavigateToMapPoint &&
        !onSelectCustomStopFromMap &&
        !onOpenAroundSearchFromMap)
    )
      return;

    let abortController: AbortController | null = null;
    let longPressTimer: NodeJS.Timeout | null = null;
    let startTouchPos: { x: number; y: number } | null = null;

    const handleLocationSelect = async (lng: number, lat: number) => {
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
        className: "custom-map-popup",
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
      btnGroup.style.flexDirection = "column";
      btnGroup.style.gap = "6px";

      if (onSelectStartFromMap) {
        const btnStart = document.createElement("button");
        btnStart.type = "button";
        btnStart.textContent = "Chọn làm Điểm Bắt Đầu";
        btnStart.style.flex = "1";
        btnStart.style.padding = "12px 14px";
        btnStart.style.fontSize = "13px";
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
        btnEnd.style.padding = "12px 14px";
        btnEnd.style.fontSize = "13px";
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
        const isMaxStopsReached = customStops.length >= MAX_CUSTOM_STOPS;

        const btnStop = document.createElement("button");
        btnStop.type = "button";
        btnStop.textContent = isMaxStopsReached
          ? `Đã đạt tối đa ${MAX_CUSTOM_STOPS} điểm dừng`
          : "Thêm điểm dừng";
        btnStop.disabled = isMaxStopsReached;
        btnStop.style.flex = "1";
        btnStop.style.padding = "12px 14px";
        btnStop.style.fontSize = "13px";
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
        btnAround.style.padding = "12px 14px";
        btnAround.style.fontSize = "13px";
        btnAround.style.fontWeight = "600";
        btnAround.style.color = "#ffffff";
        btnAround.style.backgroundColor = "#0ea5e9";
        btnAround.style.border = "none";
        btnAround.style.borderRadius = "6px";
        btnAround.style.cursor = "pointer";

        btnAround.addEventListener("click", () => {
          if (searchAroundMarkerRef.current) {
            searchAroundMarkerRef.current.remove();
          }

          searchAroundMarkerRef.current = new Marker({ anchor: "center" })
            .setLngLat([place.lon, place.lat])
            .addTo(map);

          onOpenAroundSearchFromMap(place);
          loadingPopup.remove();
        });

        btnGroup.appendChild(btnAround);
      }

      if (onNavigateToMapPoint) {
        const btnNavigate = document.createElement("button");
        btnNavigate.type = "button";
        btnNavigate.textContent = "Đi đến đây";

        btnNavigate.style.width = "100%";
        btnNavigate.style.padding = "14px 16px";
        btnNavigate.style.marginTop = "4px";

        // Font hỗ trợ tiếng Việt đầy đủ
        btnNavigate.style.fontFamily =
          'Inter, "Segoe UI", Roboto, Arial, sans-serif';

        btnNavigate.style.fontSize = "14px";
        btnNavigate.style.fontWeight = "800";
        btnNavigate.style.letterSpacing = "0.1px";
        btnNavigate.style.lineHeight = "1.4";

        btnNavigate.style.color = "#ffffff";

        // Gradient đặc biệt nhất
        btnNavigate.style.background =
          "linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%)";

        btnNavigate.style.border = "1px solid rgba(255, 255, 255, 0.25)";
        btnNavigate.style.borderRadius = "10px";
        btnNavigate.style.cursor = "pointer";

        btnNavigate.style.boxShadow =
          "0 6px 18px rgba(79, 70, 229, 0.40), " +
          "inset 0 1px 0 rgba(255, 255, 255, 0.20)";

        btnNavigate.style.transition =
          "transform 0.15s ease, " +
          "box-shadow 0.15s ease, " +
          "filter 0.15s ease";

        btnNavigate.style.textRendering = "optimizeLegibility";

        btnNavigate.addEventListener("mouseenter", () => {
          btnNavigate.style.filter = "brightness(1.08)";
          btnNavigate.style.transform = "translateY(-1px)";
          btnNavigate.style.boxShadow =
            "0 8px 22px rgba(79, 70, 229, 0.50), " +
            "inset 0 1px 0 rgba(255, 255, 255, 0.25)";
        });

        btnNavigate.addEventListener("mouseleave", () => {
          btnNavigate.style.filter = "brightness(1)";
          btnNavigate.style.transform = "translateY(0)";
          btnNavigate.style.boxShadow =
            "0 6px 18px rgba(79, 70, 229, 0.40), " +
            "inset 0 1px 0 rgba(255, 255, 255, 0.20)";
        });

        btnNavigate.addEventListener("mousedown", () => {
          btnNavigate.style.transform = "scale(0.98)";
        });

        btnNavigate.addEventListener("mouseup", () => {
          btnNavigate.style.transform = "translateY(-1px)";
        });

        btnNavigate.addEventListener("click", () => {
          onNavigateToMapPoint(place);
          loadingPopup.remove();
        });

        btnGroup.appendChild(btnNavigate);
      }

      container.appendChild(btnGroup);
      loadingPopup.setDOMContent(container);
    };

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      handleLocationSelect(lng, lat);
    };

    const handleTouchStart = (e: maplibregl.MapTouchEvent) => {
      if (e.points.length !== 1) return;
      startTouchPos = { x: e.point.x, y: e.point.y };

      const { lng, lat } = e.lngLat;
      longPressTimer = setTimeout(() => {
        handleLocationSelect(lng, lat);
      }, 500); // Giữ 500ms để kích hoạt
    };

    const handleTouchMove = (e: maplibregl.MapTouchEvent) => {
      if (!startTouchPos) return;
      const dx = Math.abs(e.point.x - startTouchPos.x);
      const dy = Math.abs(e.point.y - startTouchPos.y);
      // Hủy nhấn giữ nếu di chuyển tay quá 10px (vuốt bản đồ)
      if (dx > 10 || dy > 10) {
        if (longPressTimer) clearTimeout(longPressTimer);
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
    };

    map.on("contextmenu", handleClick);
    map.on("touchstart", handleTouchStart);
    map.on("touchmove", handleTouchMove);
    map.on("touchend", handleTouchEnd);

    return () => {
      map.off("contextmenu", handleClick);
      map.off("touchstart", handleTouchStart);
      map.off("touchmove", handleTouchMove);
      map.off("touchend", handleTouchEnd);
      if (longPressTimer) clearTimeout(longPressTimer);
    };
  }, [
    onSelectStartFromMap,
    onSelectEndFromMap,
    onNavigateToMapPoint,
    onSelectCustomStopFromMap,
    onOpenAroundSearchFromMap,
    customStops,
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers: maplibregl.Marker[] = [];

    VIETNAM_SOVEREIGNTY_STOPS.forEach((item) => {
      // Tạo phần tử HTML chứa nhãn màu cam
      const el = document.createElement("div");
      el.className = "sovereignty-label-marker";
      el.innerHTML = `
      <div style="
        background: linear-gradient(135deg, #f97316, #ea580c);
        color: #ffffff;
        font-weight: 800;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        border: 1.5px solid #ffffff;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 4px;
        pointer-events: none;
      ">
        <strong>${item.label}</strong>
      </div>
    `;

      // Gắn Marker vào bản đồ
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([item.lng, item.lat])
        .addTo(map!);

      markers.push(marker);
    });

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [mapStyleId]);

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

  // sovereigntyLocations.forEach((location) => {
  //   const el = document.createElement("div");
  //   el.className = "flex flex-col items-center gap-1 select-none";
  //   el.style.pointerEvents = "none";
  //   el.innerHTML = `
  //     <span style="
  //       white-space: nowrap;
  //       background-color: #f59e0b;
  //       color: #ffffff;
  //       font-weight: 700;
  //       font-size: 11px;
  //       line-height: 1.2;
  //       padding: 4px 8px;
  //       border-radius: 6px;
  //       box-shadow: 0 2px 6px rgba(0,0,0,0.35);
  //     ">${escapeHtml(SOVEREIGNTY_LABEL_TEXT)}</span>
  //     <span style="
  //       display: block;
  //       height: 10px;
  //       width: 10px;
  //       border-radius: 9999px;
  //       background-color: #f59e0b;
  //       box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  //     "></span>
  //   `;

  //   const marker = new Marker({ element: el, anchor: "bottom" })
  //     .setLngLat([location.lon, location.lat])
  //     .addTo(map);

  //   markersRef.current.push(marker);
  // });

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
