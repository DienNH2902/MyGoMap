import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import type { RouteGeometry } from "@/lib/types";
import * as turf from "@turf/turf";
import type { Feature, LineString } from "geojson";
import {
  fetchDrivingRoute,
  type RouteOptions,
} from "@/lib/routing/openRouteService";

interface UserLocation {
  lat: number;
  lon: number;
  heading: number | null;
  accuracy: number;
}

/** Điểm đến cố định của chuyến đi (đích cuối cùng) — dùng để tính lại lộ
 * trình từ vị trí hiện tại của người dùng, chứ không phải điểm cuối tĩnh của
 * route đã lên kế hoạch trước đó. */
interface NavigationDestination {
  lon: number;
  lat: number;
}

interface NavigationState {
  isNavigating: boolean;
  userLocation: UserLocation | null;
  distanceToDestination: number | null;
  estimatedTimeRemaining: number | null;
  nearestPointOnRoute: [number, number] | null;
  isOffRoute: boolean;
  /**
   * Lộ trình được TÍNH LẠI liên tục từ vị trí hiện tại của người dùng đến
   * điểm đến — đây mới là tuyến đường thực sự nên vẽ lên bản đồ khi đang
   * navigate. Khác với `route` (tham số truyền vào hook) vốn là lộ trình
   * TĨNH được lập lúc bấm "Tìm đường" (A → B ban đầu) và không đổi.
   */
  liveRoute: RouteGeometry | null;
  /** true trong lúc đang gọi API tính lại lộ trình theo vị trí mới. */
  isRerouting: boolean;
}

/** Ngưỡng để quyết định có nên gọi tính lại lộ trình hay không — tránh gọi
 * API dồn dập mỗi lần GPS nhích vài mét. */
const REROUTE_MIN_DISTANCE_METERS = 40;
const REROUTE_MIN_INTERVAL_MS = 8000;
const REROUTE_MAX_INTERVAL_MS = 25000; // vẫn làm mới định kỳ dù đứng yên
const REROUTE_OFFROUTE_MIN_INTERVAL_MS = 4000; // đi lệch route thì ưu tiên tính lại nhanh hơn

export function useNavigationTracking(
  map: MapLibreMap | null,
  route: RouteGeometry | null,
  destination: NavigationDestination | null = null,
  routeOptions: RouteOptions = {},
) {
  const [state, setState] = useState<NavigationState>({
    isNavigating: false,
    userLocation: null,
    distanceToDestination: null,
    estimatedTimeRemaining: null,
    nearestPointOnRoute: null,
    isOffRoute: false,
    liveRoute: null,
    isRerouting: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const routeLineRef = useRef<Feature<LineString> | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const currentHeadingRef = useRef<number>(0);

  // --- Trạng thái phục vụ việc "tính lại lộ trình theo vị trí hiện tại" ---
  const isNavigatingRef = useRef(false);
  const destinationRef = useRef<NavigationDestination | null>(destination);
  destinationRef.current = destination;
  const routeOptionsRef = useRef<RouteOptions>(routeOptions);
  routeOptionsRef.current = routeOptions;
  const isFetchingRouteRef = useRef(false);
  const lastRerouteAtRef = useRef(0);
  const lastReroutePosRef = useRef<{ lat: number; lon: number } | null>(null);
  const rerouteRequestIdRef = useRef(0);

  // Khởi tạo Marker hình mũi tên điều hướng
  const getOrCreateMarker = useCallback(() => {
    if (userMarkerRef.current || !map) return userMarkerRef.current;

    // Tạo Element SVG Mũi tên
    const el = document.createElement("div");
    el.className = "user-location-puck";
    el.innerHTML = `
      <div style="
        width: 64px; 
        height: 64px; 
        display: flex; 
        align-items: center; 
        justify-content: center;
        filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3));
      ">
        <svg width="102" height="102" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="14" fill="#3B82F6" fill-opacity="0.25" />
          <path d="M16 4L25 24L16 20L7 24L16 4Z" fill="#2563EB" stroke="#FFFFFF" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
    `;

    userMarkerRef.current = new maplibregl.Marker({
      element: el,
      rotationAlignment: "map",
      pitchAlignment: "map",
    });

    return userMarkerRef.current;
  }, [map]);

  // Lắng nghe cảm biến la bàn di động (cho trường hợp đứng yên vẫn quay mũi tên được)
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let compassHeading: number | null = null;

      // Hỗ trợ iOS (webkitCompassHeading)
      if (
        "webkitCompassHeading" in event &&
        typeof (event as any).webkitCompassHeading === "number"
      ) {
        compassHeading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        // Hỗ trợ Android
        compassHeading = 360 - event.alpha;
      }

      if (compassHeading !== null) {
        currentHeadingRef.current = compassHeading;
        if (userMarkerRef.current) {
          userMarkerRef.current.setRotation(compassHeading);
        }
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientation", handleOrientation, true);
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  // Khởi tạo route line từ Turf.js
  useEffect(() => {
    if (!route || !route.coordinates || route.coordinates.length < 2) {
      routeLineRef.current = null;
      return;
    }

    try {
      routeLineRef.current = turf.lineString(route.coordinates);
    } catch (err) {
      console.error("Failed to create route line:", err);
      routeLineRef.current = null;
    }
  }, [route]);

  // Tính khoảng cách và thời gian còn lại
  const calculateRemainingDistance = useCallback(
    (userLat: number, userLon: number) => {
      if (!routeLineRef.current) return null;

      // Đích để tính khoảng cách còn lại: ưu tiên điểm đến thực (destination)
      // được truyền vào hook — vì đây là đích cố định của cả chuyến, trong
      // khi lộ trình có thể được tính lại liên tục theo vị trí hiện tại.
      // Nếu không có destination (trường hợp gọi hook không truyền, giữ
      // tương thích ngược) thì rơi về hành vi cũ: lấy điểm cuối của route.
      const fallbackLastCoord = route?.coordinates?.length
        ? route.coordinates[route.coordinates.length - 1]
        : null;
      const destinationCoord: [number, number] | null = destinationRef.current
        ? [destinationRef.current.lon, destinationRef.current.lat]
        : (fallbackLastCoord ?? null);

      if (!destinationCoord) return null;

      try {
        const userPoint = turf.point([userLon, userLat]);
        const nearestPoint = turf.nearestPointOnLine(
          routeLineRef.current,
          userPoint,
        );

        const destination = turf.point(destinationCoord);
        const slicedRoute = turf.lineSlice(
          nearestPoint,
          destination,
          routeLineRef.current,
        );
        const remainingDistance = turf.length(slicedRoute, {
          units: "kilometers",
        });

        const avgSpeed = 40; // km/h
        const remainingTime = (remainingDistance / avgSpeed) * 60; // phút

        const distanceFromRoute = turf.distance(userPoint, nearestPoint, {
          units: "meters",
        });
        const isOffRoute = distanceFromRoute > 100;

        return {
          distanceToDestination: remainingDistance,
          estimatedTimeRemaining: remainingTime,
          nearestPointOnRoute: nearestPoint.geometry.coordinates as [
            number,
            number,
          ],
          isOffRoute,
        };
      } catch (err) {
        console.error("Failed to calculate remaining distance:", err);
        return null;
      }
    },
    [route],
  );

  // Cập nhật vị trí & hướng marker trên bản đồ
  const updateMarker = useCallback(
    (lng: number, lat: number, heading: number | null) => {
      if (!map) return;
      const marker = getOrCreateMarker();
      if (!marker) return;

      const effectiveHeading = heading ?? currentHeadingRef.current ?? 0;

      marker.setLngLat([lng, lat]);
      marker.setRotation(effectiveHeading);

      if (!marker.addTo(map)) {
        marker.addTo(map);
      }
    },
    [map, getOrCreateMarker],
  );

  /**
   * Tính lại lộ trình từ VỊ TRÍ HIỆN TẠI của người dùng đến điểm đến cố định.
   * Đây là phần thay thế cho việc chỉ hiển thị một route A→B tĩnh rồi để
   * chấm định vị tự bám theo line có sẵn — giờ mỗi khi người dùng di chuyển
   * đủ xa (hoặc đi lệch đường), tuyến đường trên bản đồ được vẽ lại đúng từ
   * nơi họ đang đứng, giống điều hướng thật (Google Maps/TomTom).
   */
  const performReroute = useCallback(
    async (userLat: number, userLon: number) => {
      const dest = destinationRef.current;
      if (!dest) return;
      if (isFetchingRouteRef.current) return;

      isFetchingRouteRef.current = true;
      const requestId = ++rerouteRequestIdRef.current;
      setState((prev) => ({ ...prev, isRerouting: true }));

      try {
        const newRoute = await fetchDrivingRoute(
          { lon: userLon, lat: userLat },
          { lon: dest.lon, lat: dest.lat },
          routeOptionsRef.current,
        );

        // Bỏ qua kết quả nếu đã có yêu cầu tính lại mới hơn xen vào, hoặc
        // người dùng đã bấm "Thoát" trong lúc đang chờ API trả về.
        if (
          requestId !== rerouteRequestIdRef.current ||
          !isNavigatingRef.current
        ) {
          return;
        }

        routeLineRef.current = turf.lineString(newRoute.coordinates);
        lastRerouteAtRef.current = Date.now();
        lastReroutePosRef.current = { lat: userLat, lon: userLon };

        setState((prev) => ({
          ...prev,
          liveRoute: newRoute,
          isRerouting: false,
        }));
      } catch (err) {
        console.warn("Không thể tính lại lộ trình theo vị trí hiện tại:", err);
        if (requestId === rerouteRequestIdRef.current) {
          setState((prev) => ({ ...prev, isRerouting: false }));
        }
      } finally {
        isFetchingRouteRef.current = false;
      }
    },
    [],
  );

  /** Quyết định xem thời điểm này có nên gọi tính lại lộ trình hay không,
   * dựa trên khoảng cách đã di chuyển kể từ lần tính trước, thời gian đã
   * trôi qua, và việc có đang đi lệch tuyến hay không. */
  const maybeReroute = useCallback(
    (userLat: number, userLon: number, isOffRoute: boolean) => {
      if (!destinationRef.current) return;

      const now = Date.now();
      const lastPos = lastReroutePosRef.current;
      const movedMeters = lastPos
        ? turf.distance(
            turf.point([userLon, userLat]),
            turf.point([lastPos.lon, lastPos.lat]),
            { units: "meters" },
          )
        : Infinity;
      const timeSinceLast = now - lastRerouteAtRef.current;

      const shouldReroute =
        (movedMeters >= REROUTE_MIN_DISTANCE_METERS &&
          timeSinceLast >= REROUTE_MIN_INTERVAL_MS) ||
        (isOffRoute && timeSinceLast >= REROUTE_OFFROUTE_MIN_INTERVAL_MS) ||
        timeSinceLast >= REROUTE_MAX_INTERVAL_MS;

      if (shouldReroute) {
        void performReroute(userLat, userLon);
      }
    },
    [performReroute],
  );

  // Bắt đầu navigation tracking
  const startNavigation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ GPS");
      return;
    }

    if (!route) {
      alert("Chưa có lộ trình để điều hướng");
      return;
    }

    // Yêu cầu cấp quyền cảm biến la bàn trên iOS (Safari)
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }

    setState((prev) => ({ ...prev, isNavigating: true }));
    isNavigatingRef.current = true;
    // Reset trạng thái tính-lại-lộ-trình mỗi lần bắt đầu navigate mới, để
    // chắc chắn có một lần tính route-từ-vị-trí-hiện-tại ngay lập tức.
    lastRerouteAtRef.current = 0;
    lastReroutePosRef.current = null;

    // Lấy vị trí ngay lập tức (fast-path)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading);

        if (map) {
          map.flyTo({
            center: [longitude, latitude],
            zoom: 21,
            pitch: 80,
            bearing: heading ?? currentHeadingRef.current ?? 0,
            duration: 800,
          });
        }

        setState((prev) => ({
          ...prev,
          userLocation: {
            lat: latitude,
            lon: longitude,
            heading,
            accuracy,
          },
          distanceToDestination: remaining?.distanceToDestination ?? null,
          estimatedTimeRemaining: remaining?.estimatedTimeRemaining ?? null,
          nearestPointOnRoute: remaining?.nearestPointOnRoute ?? null,
          isOffRoute: remaining?.isOffRoute ?? false,
        }));

        // Tính ngay lộ trình THẬT từ vị trí hiện tại → điểm đến, thay vì chỉ
        // dùng route A→B tĩnh đã lập lúc trước.
        void performReroute(latitude, longitude);
      },
      (error) => console.warn("Lỗi lấy vị trí ban đầu:", error),
      { enableHighAccuracy: true, timeout: 5000 },
    );

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    // Theo dõi liên tục
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading);

        setState((prev) => {
          if (map && prev.isNavigating) {
            map.easeTo({
              center: [longitude, latitude],
              zoom: 21,
              bearing: heading ?? currentHeadingRef.current ?? 0,
              pitch: 80,
              duration: 400,
            });
          }

          return {
            ...prev,
            userLocation: {
              lat: latitude,
              lon: longitude,
              heading,
              accuracy,
            },
            distanceToDestination: remaining?.distanceToDestination ?? null,
            estimatedTimeRemaining: remaining?.estimatedTimeRemaining ?? null,
            nearestPointOnRoute: remaining?.nearestPointOnRoute ?? null,
            isOffRoute: remaining?.isOffRoute ?? false,
          };
        });

        // Người dùng di chuyển đến đâu, tính lại lộ trình từ đó đến đích —
        // luôn bám sát vị trí thực tế thay vì đường đi cố định ban đầu.
        maybeReroute(latitude, longitude, remaining?.isOffRoute ?? false);
      },
      (error) => {
        console.error("GPS tracking error:", error);
        if (error.code === error.PERMISSION_DENIED) {
          alert("Cần quyền truy cập vị trí để điều hướng.");
          stopNavigation();
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }, [
    map,
    route,
    calculateRemainingDistance,
    updateMarker,
    performReroute,
    maybeReroute,
  ]);

  // Dừng navigation tracking
  const stopNavigation = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    // Xóa marker khỏi map khi dừng
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    // Hủy mọi kết quả tính-lại-lộ-trình đang bay về, và reset toàn bộ trạng
    // thái rerouting để lần navigate tiếp theo bắt đầu sạch sẽ.
    isNavigatingRef.current = false;
    rerouteRequestIdRef.current += 1;
    isFetchingRouteRef.current = false;
    lastRerouteAtRef.current = 0;
    lastReroutePosRef.current = null;

    setState({
      isNavigating: false,
      userLocation: null,
      distanceToDestination: null,
      estimatedTimeRemaining: null,
      nearestPointOnRoute: null,
      isOffRoute: false,
      liveRoute: null,
      isRerouting: false,
    });

    if (map) {
      map.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 800,
      });
    }
  }, [map]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
    };
  }, []);

  return {
    ...state,
    startNavigation,
    stopNavigation,
  };
}
