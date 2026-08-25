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

/** Làm mượt giá trị số bằng Exponential Moving Average */
// function smoothValue(
//   currentValue: number,
//   newValue: number,
//   smoothingFactor = 0.3,
// ): number {
//   return currentValue + smoothingFactor * (newValue - currentValue);
// }

/** Làm mượt góc (bearing/heading) với xử lý đặc biệt cho việc vượt qua 0°/360° */
// function smoothAngle(
//   currentAngle: number,
//   newAngle: number,
//   smoothingFactor = 0.25,
// ): number {
//   let diff = newAngle - currentAngle;
//   // Normalize difference to [-180, 180]
//   while (diff > 180) diff -= 360;
//   while (diff < -180) diff += 360;

//   let result = currentAngle + smoothingFactor * diff;
//   // Normalize result to [0, 360)
//   while (result < 0) result += 360;
//   while (result >= 360) result -= 360;

//   return result;
// }

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

/** Camera khi đang dẫn đường: zoom/pitch giữ cố định như cũ, chỉ tách thành
 * hằng số để dùng chung giữa flyTo (mở đầu) và vòng lặp bám theo GPS. */
const NAV_CAMERA_ZOOM = 21;
const NAV_CAMERA_PITCH = 80;

/** GPS trên di động thường chỉ bắn tọa độ mới mỗi ~1-3 giây (không liên tục
 * như 60fps), nên nếu cứ "nhảy" thẳng đến tọa độ mới mỗi lần là sẽ bị giật.
 * Thay vào đó, mỗi khi có tọa độ mới, ta nội suy mượt (trong khoảng thời
 * gian ước lượng bằng lần cập nhật trước) từ vị trí ĐANG HIỂN THỊ trên bản
 * đồ đến vị trí mới, y hệt cách các app điều hướng như Google Maps vẽ chấm
 * xanh di chuyển liên tục dù GPS chỉ cập nhật rời rạc. */
const DEFAULT_FIX_INTERVAL_MS = 2000;
const MIN_FIX_INTERVAL_MS = 500;
const MAX_FIX_INTERVAL_MS = 5000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Nội suy góc xoay theo đường ngắn nhất (tránh mũi tên quay vòng dài 350°
 * thay vì chỉ quay 10° khi hướng đi từ 355° sang 5°). */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/** Càng gần cuối đoạn nội suy càng chậm lại một chút — cho cảm giác bám
 * GPS "đằm", đỡ giật hơn so với nội suy tuyến tính thuần túy. */
function easeOutCubic(t: number): number {
  const clamped = clamp(t, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

interface AnimatedFix {
  lng: number;
  lat: number;
  heading: number;
  timestamp: number;
}

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
  const markerMountedRef = useRef(false);
  const currentHeadingRef = useRef<number>(0);

  // Luôn giữ tham chiếu bản đồ mới nhất để vòng lặp animation (được tạo một
  // lần) không bao giờ dùng phải một `map` cũ đã lỗi thời do closure.
  const mapRef = useRef<MapLibreMap | null>(map);
  mapRef.current = map;

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

  // --- Trạng thái phục vụ việc "nội suy vị trí mượt" (chấm định vị + camera) ---
  const displayedFixRef = useRef<AnimatedFix | null>(null); // vị trí ĐANG hiển thị trên bản đồ ngay lúc này
  const moveStartRef = useRef<AnimatedFix | null>(null); // điểm bắt đầu của đoạn nội suy hiện tại
  const moveTargetRef = useRef<(AnimatedFix & { durationMs: number }) | null>(
    null,
  ); // điểm đích của đoạn nội suy hiện tại
  const lastFixArrivalAtRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const cameraFollowEnabledRef = useRef(false);
  const cameraFollowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // --- Wake Lock: giữ màn hình không tự tắt/khóa trong lúc đang dẫn đường,
  // để trình duyệt (đặc biệt Safari trên iPhone) không tạm dừng JS/GPS giữa
  // chừng — nguyên nhân phổ biến khiến việc định vị bị "khựng" khi điều
  // hướng thời gian dài. Đây là API chuẩn của trình duyệt, không phải icon
  // định vị nền của hệ điều hành (icon đó do iOS/Safari tự vẽ khi có một
  // watchPosition đang hoạt động — ứng dụng web không tự vẽ được icon này).
  const wakeLockRef = useRef<any>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request(
          "screen",
        );
      }
    } catch (err) {
      // Không hỗ trợ hoặc bị từ chối (ví dụ trình duyệt cũ, chế độ riêng
      // tư...) — không quan trọng, chỉ là tối ưu thêm, không chặn navigation.
      console.warn("Không thể giữ màn hình sáng khi dẫn đường:", err);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release?.().catch(() => {});
      wakeLockRef.current = null;
    }
  }, []);

  // Wake Lock tự động bị trình duyệt hủy khi tab bị ẩn (chuyển app khác,
  // khóa màn hình...) — hễ quay lại mà vẫn đang navigate thì xin cấp lại.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isNavigatingRef.current) {
        void acquireWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [acquireWakeLock]);

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

        // Nếu marker đã tồn tại, cập nhật HƯỚNG ĐÍCH cho vòng lặp nội suy
        // (thay vì gọi setRotation trực tiếp) — để tránh việc la bàn và
        // vòng lặp requestAnimationFrame cùng ghi đè rotation của marker,
        // gây giật/nhấp nháy. Khi không navigate (không có vòng lặp chạy),
        // vẫn set trực tiếp như hành vi cũ để mũi tên xoay được lúc đứng yên
        // xem trước bản đồ.
        if (moveTargetRef.current && isNavigatingRef.current) {
          moveTargetRef.current = {
            ...moveTargetRef.current,
            heading: compassHeading,
          };
        } else if (userMarkerRef.current) {
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

  // Cập nhật vị trí & hướng marker trên bản đồ — chỉ đặt tức thời (dùng cho
  // lần đầu tiên khi chưa có gì để nội suy). Từ lần thứ 2 trở đi, việc vẽ
  // marker được vòng lặp animation (bên dưới) đảm nhiệm mỗi khung hình.
  const ensureMarkerOnMap = useCallback(() => {
    const currentMap = mapRef.current;
    if (!currentMap) return null;
    const marker = getOrCreateMarker();
    if (!marker) return null;

    if (!markerMountedRef.current) {
      marker.addTo(currentMap);
      markerMountedRef.current = true;
    }

    return marker;
  }, [getOrCreateMarker]);

  /**
   * Nhận một tọa độ GPS mới và biến nó thành ĐÍCH nội suy tiếp theo — KHÔNG
   * nhảy thẳng marker/camera đến đó. Điểm bắt đầu của đoạn nội suy luôn là
   * vị trí ĐANG hiển thị trên bản đồ tại đúng thời điểm này (không phải tọa
   * độ GPS trước đó), nên không bao giờ có cú giật khi một fix mới đến sớm
   * hơn dự kiến. Thời lượng nội suy được ước lượng bằng khoảng cách thời
   * gian giữa 2 lần nhận fix gần nhất — mô phỏng đúng cách các app điều
   * hướng thật (Google Maps, TomTom...) làm mượt chấm định vị.
   */
  const setFixTarget = useCallback(
    (lng: number, lat: number, headingRaw: number | null) => {
      ensureMarkerOnMap();

      const now = Date.now();
      const heading =
        ((headingRaw ?? currentHeadingRef.current ?? 0) + 360) % 360;

      const prevArrival = lastFixArrivalAtRef.current;
      let durationMs = prevArrival
        ? now - prevArrival
        : DEFAULT_FIX_INTERVAL_MS;
      durationMs = clamp(durationMs, MIN_FIX_INTERVAL_MS, MAX_FIX_INTERVAL_MS);
      lastFixArrivalAtRef.current = now;

      const startFix: AnimatedFix = displayedFixRef.current ?? {
        lng,
        lat,
        heading,
        timestamp: now,
      };

      moveStartRef.current = { ...startFix, timestamp: now };
      moveTargetRef.current = { lng, lat, heading, timestamp: now, durationMs };
    },
    [ensureMarkerOnMap],
  );

  /** Vòng lặp chạy mỗi khung hình (~60fps) trong lúc đang navigate: nội suy
   * vị trí/hướng hiện tại giữa 2 lần fix GPS gần nhất rồi vẽ marker + camera
   * mượt liên tục, thay vì "nhảy cóc" mỗi khi có tọa độ GPS mới. */
  const runAnimationFrame = useCallback(() => {
    const target = moveTargetRef.current;
    const start = moveStartRef.current;

    if (target && start) {
      const now = Date.now();
      const t = easeOutCubic((now - target.timestamp) / target.durationMs);

      const lng = lerp(start.lng, target.lng, t);
      const lat = lerp(start.lat, target.lat, t);
      const heading = lerpAngle(start.heading, target.heading, t);

      displayedFixRef.current = { lng, lat, heading, timestamp: now };

      const marker = ensureMarkerOnMap();
      if (marker) {
        marker.setLngLat([lng, lat]);
        marker.setRotation(heading);
      }

      // jumpTo (thay vì flyTo/easeTo) cập nhật camera NGAY LẬP TỨC không qua
      // animation nội bộ của MapLibre — vì bản thân vòng lặp requestAnimationFrame
      // này đã là animation rồi, gọi easeTo/flyTo mỗi khung hình sẽ khiến các
      // animation chồng lấn/giành nhau và gây giật hình.
      const currentMap = mapRef.current;
      if (
        currentMap &&
        isNavigatingRef.current &&
        cameraFollowEnabledRef.current
      ) {
        currentMap.jumpTo({
          center: [lng, lat],
          zoom: NAV_CAMERA_ZOOM,
          bearing: heading,
          pitch: NAV_CAMERA_PITCH,
        });
      }
    }

    rafIdRef.current = requestAnimationFrame(runAnimationFrame);
  }, [ensureMarkerOnMap]);

  const startAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(runAnimationFrame);
  }, [runAnimationFrame]);

  const stopAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

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

    // Reset trạng thái nội suy mượt cho lần navigate mới.
    displayedFixRef.current = null;
    moveStartRef.current = null;
    moveTargetRef.current = null;
    lastFixArrivalAtRef.current = null;
    cameraFollowEnabledRef.current = false;
    if (cameraFollowTimeoutRef.current) {
      clearTimeout(cameraFollowTimeoutRef.current);
      cameraFollowTimeoutRef.current = null;
    }

    // Giữ màn hình sáng trong lúc dẫn đường — tránh Safari/iOS tạm dừng
    // trang (và theo đó là GPS/JS) khi màn hình tự khóa, nguyên nhân phổ
    // biến gây "khựng" vị trí giữa chừng.
    void acquireWakeLock();

    // Bắt đầu vòng lặp vẽ mượt ngay từ bây giờ — trước khi có fix đầu tiên
    // nó sẽ không làm gì (moveTargetRef còn null) nên vô hại.
    startAnimationLoop();

    // Lấy vị trí ngay lập tức (fast-path)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        setFixTarget(longitude, latitude, heading);

        if (map) {
          map.flyTo({
            center: [longitude, latitude],
            zoom: NAV_CAMERA_ZOOM,
            pitch: NAV_CAMERA_PITCH,
            bearing: heading ?? currentHeadingRef.current ?? 0,
            duration: 800,
          });
        }

        // Chờ hiệu ứng bay vào (flyTo, 800ms) kết thúc rồi mới để vòng lặp
        // nội suy tiếp quản camera — tránh 2 animation giành nhau máy chủ
        // ngay tại thời điểm mở màn hình dẫn đường, gây giật hình.
        if (cameraFollowTimeoutRef.current) {
          clearTimeout(cameraFollowTimeoutRef.current);
        }
        cameraFollowTimeoutRef.current = setTimeout(() => {
          cameraFollowEnabledRef.current = true;
          cameraFollowTimeoutRef.current = null;
        }, 800);

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

        // Chỉ đặt ĐÍCH nội suy mới — vòng lặp requestAnimationFrame ở trên
        // sẽ tự vẽ marker + camera mượt dần tới đây mỗi khung hình, thay vì
        // "nhảy" tức thời (updateMarker) + easeTo 400ms cũ vốn hay bị giật
        // khi khoảng cách giữa 2 lần GPS bắn không đều nhau.
        setFixTarget(longitude, latitude, heading);

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
    setFixTarget,
    performReroute,
    maybeReroute,
    acquireWakeLock,
    startAnimationLoop,
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
    markerMountedRef.current = false;

    // Dừng vòng lặp vẽ mượt và dọn sạch trạng thái nội suy.
    stopAnimationLoop();
    displayedFixRef.current = null;
    moveStartRef.current = null;
    moveTargetRef.current = null;
    lastFixArrivalAtRef.current = null;
    cameraFollowEnabledRef.current = false;
    if (cameraFollowTimeoutRef.current) {
      clearTimeout(cameraFollowTimeoutRef.current);
      cameraFollowTimeoutRef.current = null;
    }

    // Trả lại quyền tự tắt/khóa màn hình cho hệ điều hành.
    releaseWakeLock();

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
  }, [map, stopAnimationLoop, releaseWakeLock]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (cameraFollowTimeoutRef.current) {
        clearTimeout(cameraFollowTimeoutRef.current);
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
      }
    };
  }, []);

  return {
    ...state,
    startNavigation,
    stopNavigation,
  };
}
