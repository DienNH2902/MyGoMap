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

/**
 * Làm mượt giá trị số bằng Exponential Moving Average.
 */
function smoothValue(
  currentValue: number,
  newValue: number,
  smoothingFactor = 0.3,
): number {
  return currentValue + smoothingFactor * (newValue - currentValue);
}

/**
 * Làm mượt góc quay.
 * Xử lý trường hợp vượt qua 0° / 360°.
 */
function smoothAngle(
  currentAngle: number,
  newAngle: number,
  smoothingFactor = 0.25,
): number {
  let diff = newAngle - currentAngle;

  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  let result = currentAngle + smoothingFactor * diff;

  while (result < 0) result += 360;
  while (result >= 360) result -= 360;

  return result;
}

/**
 * Điểm đến cố định.
 */
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
  liveRoute: RouteGeometry | null;
  isRerouting: boolean;
}

/**
 * Ngưỡng reroute.
 */
const REROUTE_MIN_DISTANCE_METERS = 40;
const REROUTE_MIN_INTERVAL_MS = 8000;
const REROUTE_MAX_INTERVAL_MS = 25000;
const REROUTE_OFFROUTE_MIN_INTERVAL_MS = 4000;

/**
 * Chiều cao màn hình.
 */
const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;

/**
 * Camera navigation.
 */
const NAV_CAMERA_ZOOM = 19;
const NAV_CAMERA_PITCH = 80;

/**
 * Camera không được update nhanh hơn khoảng thời gian này.
 *
 * Trước đây:
 *
 * duration: 1000
 * interval: 800
 *
 * => animation cũ chưa xong thì animation mới bắt đầu.
 *
 * Bây giờ duration < interval để tránh chồng animation.
 */
const CAMERA_UPDATE_INTERVAL_MS = 800;
const CAMERA_ANIMATION_DURATION_MS = 650;

/**
 * GPS filtering.
 *
 * GPS trên điện thoại không phải lúc nào cũng chính xác tuyệt đối.
 * Khi đứng yên, tọa độ có thể dao động vài mét.
 *
 * Các giá trị dưới đây dùng để chống "GPS drift".
 */
const STATIONARY_SPEED_THRESHOLD_MS = 0.8;
const MIN_MOVEMENT_THRESHOLD_METERS = 2.5;
const ACCURACY_MULTIPLIER = 0.6;

/**
 * Không cho GPS có accuracy quá tệ kéo marker đi lung tung.
 *
 * 50m vẫn có thể xảy ra ở khu vực GPS yếu.
 */
const MAX_ACCEPTABLE_ACCURACY_METERS = 50;

/**
 * Smoothing khi đang di chuyển.
 */
const MOVING_POSITION_SMOOTHING = 0.45;

/**
 * Smoothing heading.
 */
const MOVING_HEADING_SMOOTHING = 0.3;

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

  /**
   * ============================================================
   * SMOOTHING / GPS FILTER
   * ============================================================
   */

  const smoothedLatRef = useRef<number | null>(null);

  const smoothedLonRef = useRef<number | null>(null);

  const smoothedBearingRef = useRef<number | null>(null);

  /**
   * Vị trí GPS raw cuối cùng.
   */
  const lastRawLatRef = useRef<number | null>(null);

  const lastRawLonRef = useRef<number | null>(null);

  /**
   * Thời điểm GPS cuối cùng.
   */
  const lastGpsTimestampRef = useRef<number | null>(null);

  /**
   * Camera update.
   */
  const lastCameraUpdateRef = useRef<number>(0);

  /**
   * Vị trí cuối cùng camera đã theo.
   */
  const lastCameraLatRef = useRef<number | null>(null);

  const lastCameraLonRef = useRef<number | null>(null);

  /**
   * Trạng thái đứng yên.
   */
  const stationaryRef = useRef(false);

  /**
   * ============================================================
   * REROUTING
   * ============================================================
   */

  const isNavigatingRef = useRef(false);

  const destinationRef = useRef<NavigationDestination | null>(destination);

  destinationRef.current = destination;

  const routeOptionsRef = useRef<RouteOptions>(routeOptions);

  routeOptionsRef.current = routeOptions;

  const isFetchingRouteRef = useRef(false);

  const lastRerouteAtRef = useRef(0);

  const lastReroutePosRef = useRef<{ lat: number; lon: number } | null>(null);

  const rerouteRequestIdRef = useRef(0);

  /**
   * ============================================================
   * WAKE LOCK
   * ============================================================
   *
   * Chỉ giữ màn hình sáng.
   *
   * Không phải background location service.
   */

  const wakeLockRef = useRef<any>(null);

  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request(
          "screen",
        );
      }
    } catch (err) {
      console.warn("Không thể giữ màn hình sáng khi dẫn đường:", err);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release?.().catch(() => {});

      wakeLockRef.current = null;
    }
  }, []);

  /**
   * Wake Lock bị browser release khi document hidden.
   *
   * Khi quay lại app thì xin lại.
   */
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

  /**
   * ============================================================
   * MARKER
   * ============================================================
   */

  const getOrCreateMarker = useCallback(() => {
    if (userMarkerRef.current || !map) {
      return userMarkerRef.current;
    }

    const el = document.createElement("div");

    el.className = "user-location-puck";

    el.innerHTML = `
      <div style="
        width: 84px;
        height: 84px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3));
      ">
        <svg
          width="112"
          height="112"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="#3B82F6"
            fill-opacity="0.25"
          />

          <path
            d="M16 4L25 24L16 20L7 24L16 4Z"
            fill="#2563EB"
            stroke="#FFFFFF"
            stroke-width="2"
            stroke-linejoin="round"
          />
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

  /**
   * ============================================================
   * DEVICE ORIENTATION
   * ============================================================
   */

  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let compassHeading: number | null = null;

      if (
        "webkitCompassHeading" in event &&
        typeof (event as any).webkitCompassHeading === "number"
      ) {
        compassHeading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        compassHeading = 360 - event.alpha;
      }

      if (compassHeading !== null) {
        currentHeadingRef.current = compassHeading;

        /**
         * Không xoay marker mạnh khi người dùng
         * đang đứng yên.
         *
         * Giảm hiện tượng mũi tên rung liên tục.
         */
        if (!stationaryRef.current && userMarkerRef.current) {
          if (smoothedBearingRef.current === null) {
            smoothedBearingRef.current = compassHeading;
          } else {
            smoothedBearingRef.current = smoothAngle(
              smoothedBearingRef.current,
              compassHeading,
              0.12,
            );
          }

          userMarkerRef.current.setRotation(smoothedBearingRef.current);
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

  /**
   * ============================================================
   * ROUTE LINE
   * ============================================================
   */

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

  /**
   * ============================================================
   * REMAINING DISTANCE
   * ============================================================
   */

  const calculateRemainingDistance = useCallback(
    (userLat: number, userLon: number) => {
      if (!routeLineRef.current) {
        return null;
      }

      const fallbackLastCoord = route?.coordinates?.length
        ? route.coordinates[route.coordinates.length - 1]
        : null;

      const destinationCoord: [number, number] | null = destinationRef.current
        ? [destinationRef.current.lon, destinationRef.current.lat]
        : (fallbackLastCoord ?? null);

      if (!destinationCoord) {
        return null;
      }

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

        const avgSpeed = 40;

        const remainingTime = (remainingDistance / avgSpeed) * 60;

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

  /**
   * ============================================================
   * GPS POSITION FILTER
   * ============================================================
   *
   * Đây là phần quan trọng nhất.
   *
   * GPS đứng yên vẫn có thể trả về:
   *
   * A
   * A + 3m
   * A - 2m
   * A + 5m
   * A - 4m
   *
   * Nếu đưa thẳng vào marker thì marker sẽ rung.
   *
   * Hàm này:
   *
   * 1. kiểm tra accuracy
   * 2. xác định người dùng có đang đứng yên không
   * 3. nếu đứng yên thì giữ marker
   * 4. nếu di chuyển thì smoothing
   */

  const updateMarker = useCallback(
    (
      lng: number,
      lat: number,
      heading: number | null,
      accuracy: number,
      speed: number | null,
    ) => {
      if (!map) return;

      const marker = getOrCreateMarker();

      if (!marker) return;

      /**
       * Nếu accuracy quá tệ thì không dùng GPS fix này
       * để kéo marker.
       *
       * Tuy nhiên vẫn giữ GPS raw cho navigation/reroute.
       */
      const usableAccuracy = Math.min(
        Math.max(Number.isFinite(accuracy) ? accuracy : 50, 1),
        MAX_ACCEPTABLE_ACCURACY_METERS,
      );

      /**
       * Vị trí filtered hiện tại.
       */
      if (smoothedLatRef.current === null || smoothedLonRef.current === null) {
        smoothedLatRef.current = lat;
        smoothedLonRef.current = lng;

        lastRawLatRef.current = lat;
        lastRawLonRef.current = lng;

        stationaryRef.current =
          speed !== null && speed < STATIONARY_SPEED_THRESHOLD_MS;
      } else {
        const distanceFromFiltered = turf.distance(
          turf.point([smoothedLonRef.current, smoothedLatRef.current]),
          turf.point([lng, lat]),
          {
            units: "meters",
          },
        );

        /**
         * Xác định đang đứng yên.
         *
         * Nếu GPS báo speed gần 0 và vị trí mới
         * vẫn nằm trong vùng sai số thì coi như
         * người dùng vẫn đứng nguyên.
         */
        const stationaryBySpeed =
          speed !== null && speed >= 0 && speed < STATIONARY_SPEED_THRESHOLD_MS;

        const stationaryByDistance =
          distanceFromFiltered <=
          Math.max(
            MIN_MOVEMENT_THRESHOLD_METERS,
            usableAccuracy * ACCURACY_MULTIPLIER,
          );

        const isStationary = stationaryBySpeed && stationaryByDistance;

        stationaryRef.current = isStationary;

        if (!isStationary) {
          /**
           * Khi đang di chuyển:
           *
           * GPS tốt → phản hồi nhanh hơn.
           * GPS kém → smoothing mạnh hơn.
           */
          const accuracyFactor = clamp(
            1 - (usableAccuracy / 50) * 0.5,
            0.2,
            0.7,
          );

          const smoothingFactor = Math.min(
            MOVING_POSITION_SMOOTHING,
            accuracyFactor,
          );

          smoothedLatRef.current = smoothValue(
            smoothedLatRef.current,
            lat,
            smoothingFactor,
          );

          smoothedLonRef.current = smoothValue(
            smoothedLonRef.current,
            lng,
            smoothingFactor,
          );
        }

        lastRawLatRef.current = lat;
        lastRawLonRef.current = lng;
      }

      /**
       * Heading.
       *
       * Khi đứng yên GPS heading thường không đáng tin.
       * Vì vậy không liên tục quay mũi tên theo GPS noise.
       */
      const effectiveHeading = heading ?? currentHeadingRef.current ?? 0;

      if (smoothedBearingRef.current === null) {
        smoothedBearingRef.current = effectiveHeading;
      } else if (!stationaryRef.current) {
        smoothedBearingRef.current = smoothAngle(
          smoothedBearingRef.current,
          effectiveHeading,
          MOVING_HEADING_SMOOTHING,
        );
      }

      /**
       * Đặt marker.
       */
      marker.setLngLat([smoothedLonRef.current, smoothedLatRef.current]);

      marker.setRotation(smoothedBearingRef.current);

      /**
       * MapLibre Marker chỉ cần add một lần.
       */
      if (!marker.getElement().parentElement) {
        marker.addTo(map);
      }
    },
    [map, getOrCreateMarker],
  );

  /**
   * clamp helper.
   */
  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * ============================================================
   * REROUTE
   * ============================================================
   */

  const performReroute = useCallback(
    async (userLat: number, userLon: number) => {
      const dest = destinationRef.current;

      if (!dest) return;

      if (isFetchingRouteRef.current) {
        return;
      }

      isFetchingRouteRef.current = true;

      const requestId = ++rerouteRequestIdRef.current;

      setState((prev) => ({
        ...prev,
        isRerouting: true,
      }));

      try {
        const newRoute = await fetchDrivingRoute(
          {
            lon: userLon,
            lat: userLat,
          },
          {
            lon: dest.lon,
            lat: dest.lat,
          },
          routeOptionsRef.current,
        );

        if (
          requestId !== rerouteRequestIdRef.current ||
          !isNavigatingRef.current
        ) {
          return;
        }

        routeLineRef.current = turf.lineString(newRoute.coordinates);

        lastRerouteAtRef.current = Date.now();

        lastReroutePosRef.current = {
          lat: userLat,
          lon: userLon,
        };

        setState((prev) => ({
          ...prev,
          liveRoute: newRoute,
          isRerouting: false,
        }));
      } catch (err) {
        console.warn("Không thể tính lại lộ trình theo vị trí hiện tại:", err);

        if (requestId === rerouteRequestIdRef.current) {
          setState((prev) => ({
            ...prev,
            isRerouting: false,
          }));
        }
      } finally {
        isFetchingRouteRef.current = false;
      }
    },
    [],
  );

  /**
   * ============================================================
   * MAYBE REROUTE
   * ============================================================
   */

  const maybeReroute = useCallback(
    (userLat: number, userLon: number, isOffRoute: boolean) => {
      if (!destinationRef.current) {
        return;
      }

      const now = Date.now();

      const lastPos = lastReroutePosRef.current;

      const movedMeters = lastPos
        ? turf.distance(
            turf.point([userLon, userLat]),
            turf.point([lastPos.lon, lastPos.lat]),
            {
              units: "meters",
            },
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

  /**
   * ============================================================
   * CAMERA
   * ============================================================
   *
   * Camera sử dụng vị trí đã lọc.
   *
   * Không dùng GPS raw để camera chạy theo.
   *
   * Điều này rất quan trọng để tránh:
   *
   * GPS noise → camera rung → map rung.
   */

  const updateNavigationCamera = useCallback(
    (heading: number | null) => {
      if (!map) return;

      if (!isNavigatingRef.current) {
        return;
      }

      /**
       * Nếu đang đứng yên thì không cần
       * liên tục animate camera.
       */
      if (stationaryRef.current) {
        return;
      }

      const lat = smoothedLatRef.current;

      const lon = smoothedLonRef.current;

      if (lat === null || lon === null) {
        return;
      }

      const now = Date.now();

      /**
       * Throttle camera.
       */
      if (now - lastCameraUpdateRef.current < CAMERA_UPDATE_INTERVAL_MS) {
        return;
      }

      /**
       * Nếu marker gần như chưa di chuyển
       * thì camera cũng không cần chạy.
       */
      if (
        lastCameraLatRef.current !== null &&
        lastCameraLonRef.current !== null
      ) {
        const cameraDistance = turf.distance(
          turf.point([lastCameraLonRef.current, lastCameraLatRef.current]),
          turf.point([lon, lat]),
          {
            units: "meters",
          },
        );

        if (cameraDistance < 2) {
          return;
        }
      }

      lastCameraUpdateRef.current = now;

      lastCameraLatRef.current = lat;

      lastCameraLonRef.current = lon;

      const targetBearing =
        smoothedBearingRef.current ?? heading ?? currentHeadingRef.current ?? 0;

      /**
       * duration < interval.
       *
       * Không để animation camera chồng nhau.
       */
      map.easeTo({
        center: [lon, lat],
        zoom: NAV_CAMERA_ZOOM,
        bearing: targetBearing,
        pitch: NAV_CAMERA_PITCH,

        duration: CAMERA_ANIMATION_DURATION_MS,

        padding: {
          top: Math.round(screenHeight * 0.33),
          bottom: 0,
          left: 0,
          right: 0,
        },

        essential: true,
      });
    },
    [map],
  );

  /**
   * ============================================================
   * START NAVIGATION
   * ============================================================
   */

  const startNavigation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ GPS");

      return;
    }

    if (!route) {
      alert("Chưa có lộ trình để điều hướng");

      return;
    }

    /**
     * iOS compass permission.
     */
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }

    /**
     * Reset navigation.
     */
    setState((prev) => ({
      ...prev,
      isNavigating: true,
    }));

    isNavigatingRef.current = true;

    lastRerouteAtRef.current = 0;
    lastReroutePosRef.current = null;

    /**
     * Reset smoothing.
     */
    smoothedLatRef.current = null;

    smoothedLonRef.current = null;

    smoothedBearingRef.current = null;

    lastRawLatRef.current = null;

    lastRawLonRef.current = null;

    lastGpsTimestampRef.current = null;

    stationaryRef.current = false;

    lastCameraUpdateRef.current = 0;

    lastCameraLatRef.current = null;

    lastCameraLonRef.current = null;

    /**
     * Giữ màn hình sáng.
     */
    void acquireWakeLock();

    /**
     * ========================================================
     * FIRST GPS FIX
     * ========================================================
     */

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy, speed } =
          position.coords;

        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading, accuracy, speed);

        if (map) {
          map.flyTo({
            center: [
              smoothedLonRef.current ?? longitude,
              smoothedLatRef.current ?? latitude,
            ],

            zoom: NAV_CAMERA_ZOOM,

            pitch: NAV_CAMERA_PITCH,

            bearing:
              smoothedBearingRef.current ??
              heading ??
              currentHeadingRef.current ??
              0,

            duration: 800,

            padding: {
              top: Math.round(screenHeight * 0.33),
              bottom: 0,
              left: 0,
              right: 0,
            },

            essential: true,
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

        /**
         * Reroute vẫn dùng GPS raw.
         *
         * Không dùng vị trí smoothed.
         *
         * Như vậy không làm thay đổi logic
         * tính lại route của hệ thống.
         */
        void performReroute(latitude, longitude);
      },

      (error) => {
        console.warn("Lỗi lấy vị trí ban đầu:", error);
      },

      {
        enableHighAccuracy: true,

        timeout: 10000,

        /**
         * Cho phép lấy cache rất gần đây.
         */
        maximumAge: 1000,
      },
    );

    /**
     * ========================================================
     * WATCH GPS
     * ========================================================
     */

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy, speed } =
          position.coords;

        const remaining = calculateRemainingDistance(latitude, longitude);

        /**
         * Marker sử dụng filtered position.
         */
        updateMarker(longitude, latitude, heading, accuracy, speed);

        /**
         * Camera cũng sử dụng filtered position.
         */
        updateNavigationCamera(heading);

        /**
         * State vẫn cập nhật GPS raw.
         *
         * Không thay đổi logic dữ liệu navigation.
         */
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

        /**
         * Reroute vẫn dùng vị trí raw.
         */
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
        /**
         * Yêu cầu GPS tốt nhất mà browser
         * có thể cung cấp.
         */
        enableHighAccuracy: true,

        timeout: 15000,

        /**
         * Cho phép sử dụng GPS fix gần đây.
         *
         * 1000ms giúp giảm tình trạng chờ
         * GPS mới quá lâu trên mobile.
         */
        maximumAge: 1000,
      },
    );
  }, [
    map,
    route,
    calculateRemainingDistance,
    updateMarker,
    updateNavigationCamera,
    performReroute,
    maybeReroute,
    acquireWakeLock,
  ]);

  /**
   * ============================================================
   * STOP NAVIGATION
   * ============================================================
   */

  const stopNavigation = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);

      watchIdRef.current = null;
    }

    /**
     * Remove marker.
     */
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();

      userMarkerRef.current = null;
    }

    /**
     * Reset smoothing.
     */
    smoothedLatRef.current = null;

    smoothedLonRef.current = null;

    smoothedBearingRef.current = null;

    lastRawLatRef.current = null;

    lastRawLonRef.current = null;

    lastGpsTimestampRef.current = null;

    stationaryRef.current = false;

    lastCameraUpdateRef.current = 0;

    lastCameraLatRef.current = null;

    lastCameraLonRef.current = null;

    /**
     * Hủy reroute.
     */
    isNavigatingRef.current = false;

    rerouteRequestIdRef.current += 1;

    isFetchingRouteRef.current = false;

    lastRerouteAtRef.current = 0;

    lastReroutePosRef.current = null;

    /**
     * Trả lại quyền tự khóa màn hình.
     */
    releaseWakeLock();

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

    /**
     * Trả camera về trạng thái map bình thường.
     */
    if (map) {
      map.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 800,
      });
    }
  }, [map, releaseWakeLock]);

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   */

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
      }

      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
      }
    };
  }, []);

  /**
   * ============================================================
   * RETURN
   * ============================================================
   */

  return {
    ...state,

    startNavigation,

    stopNavigation,
  };
}
