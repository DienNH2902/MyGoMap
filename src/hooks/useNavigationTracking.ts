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
 *
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
 * ============================================================
 * REROUTE
 * ============================================================
 */

const REROUTE_MIN_DISTANCE_METERS = 40;
const REROUTE_MIN_INTERVAL_MS = 8000;
const REROUTE_MAX_INTERVAL_MS = 25000;
const REROUTE_OFFROUTE_MIN_INTERVAL_MS = 4000;

/**
 * ============================================================
 * CAMERA
 * ============================================================
 */

const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;

const NAV_CAMERA_ZOOM = 19;
const NAV_CAMERA_PITCH = 80;

const CAMERA_UPDATE_INTERVAL_MS = 800;
const CAMERA_ANIMATION_DURATION_MS = 650;

/**
 * ============================================================
 * GPS FILTERING
 * ============================================================
 */

const STATIONARY_SPEED_THRESHOLD_MS = 0.8;
const MIN_MOVEMENT_THRESHOLD_METERS = 2.5;
const ACCURACY_MULTIPLIER = 0.6;

const MAX_ACCEPTABLE_ACCURACY_METERS = 50;

const MOVING_POSITION_SMOOTHING = 0.45;

const MOVING_HEADING_SMOOTHING = 0.3;

/**
 * ============================================================
 * COMPASS
 * ============================================================
 *
 * Compass hoạt động độc lập với GPS.
 *
 * GPS:
 * - xác định vị trí
 * - speed
 * - reroute
 *
 * Compass:
 * - xác định hướng người dùng đang nhìn
 * - xoay mũi tên
 * - xoay camera
 *
 * Vì vậy khi người dùng đứng yên nhưng xoay điện thoại,
 * mũi tên vẫn phải quay theo.
 */

const COMPASS_HEADING_SMOOTHING = 0.18;

const COMPASS_CAMERA_UPDATE_INTERVAL_MS = 100;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Chuẩn hóa heading về 0 - 360.
 */
function normalizeHeading(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

/**
 * ============================================================
 * HOOK
 * ============================================================
 */

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

  /**
   * ============================================================
   * REFS
   * ============================================================
   */

  const watchIdRef = useRef<number | null>(null);

  const routeLineRef = useRef<Feature<LineString> | null>(null);

  const userMarkerRef = useRef<Marker | null>(null);

  /**
   * Heading hiện tại.
   *
   * Đây là heading fallback / compatibility.
   */
  const currentHeadingRef = useRef<number>(0);

  /**
   * ============================================================
   * GPS SMOOTHING
   * ============================================================
   */

  const smoothedLatRef = useRef<number | null>(null);

  const smoothedLonRef = useRef<number | null>(null);

  const smoothedBearingRef = useRef<number | null>(null);

  /**
   * ============================================================
   * RAW GPS
   * ============================================================
   */

  const lastRawLatRef = useRef<number | null>(null);

  const lastRawLonRef = useRef<number | null>(null);

  const lastGpsTimestampRef = useRef<number | null>(null);

  /**
   * ============================================================
   * CAMERA
   * ============================================================
   */

  const lastCameraUpdateRef = useRef<number>(0);

  const lastCameraLatRef = useRef<number | null>(null);

  const lastCameraLonRef = useRef<number | null>(null);

  /**
   * ============================================================
   * STATIONARY
   * ============================================================
   */

  const stationaryRef = useRef(false);

  /**
   * ============================================================
   * COMPASS
   * ============================================================
   */

  /**
   * Heading lấy trực tiếp từ DeviceOrientation.
   *
   * Đây là heading ưu tiên cao nhất.
   */
  const compassHeadingRef = useRef<number | null>(null);

  /**
   * Throttle riêng cho camera khi xoay theo compass.
   */
  const lastCompassCameraUpdateRef = useRef<number>(0);

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

  const lastReroutePosRef = useRef<{
    lat: number;
    lon: number;
  } | null>(null);

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
   * ============================================================
   * WAKE LOCK VISIBILITY
   * ============================================================
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
   * COMPASS HEADING
   * ============================================================
   */

  const getCompassHeading = useCallback(
    (event: DeviceOrientationEvent): number | null => {
      /**
       * ========================================================
       * iOS
       * ========================================================
       *
       * Safari/iOS cung cấp:
       *
       * webkitCompassHeading
       *
       * Đây là heading theo compass thực tế.
       */

      if (
        "webkitCompassHeading" in event &&
        typeof (event as any).webkitCompassHeading === "number"
      ) {
        const heading = (event as any).webkitCompassHeading;

        if (Number.isFinite(heading)) {
          return normalizeHeading(heading);
        }
      }

      /**
       * ========================================================
       * Android / Absolute Orientation
       * ========================================================
       */

      if (event.alpha !== null && event.absolute === true) {
        const heading = 360 - event.alpha;

        return normalizeHeading(heading);
      }

      /**
       * ========================================================
       * Fallback
       * ========================================================
       */

      if (event.alpha !== null) {
        const heading = 360 - event.alpha;

        return normalizeHeading(heading);
      }

      return null;
    },
    [],
  );

  /**
   * ============================================================
   * COMPASS ORIENTATION HANDLER
   * ============================================================
   *
   * Đây là phần quan trọng nhất.
   *
   * KHÔNG kiểm tra stationaryRef ở đây.
   *
   * Người dùng đứng yên vẫn phải xoay được mũi tên.
   */

  const handleCompassOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      if (!isNavigatingRef.current) {
        return;
      }

      const heading = getCompassHeading(event);

      if (heading === null) {
        return;
      }

      /**
       * Raw compass heading.
       */
      currentHeadingRef.current = heading;

      /**
       * Smooth compass.
       *
       * Smoothing vừa phải để giảm rung nhưng vẫn
       * phản hồi nhanh khi người dùng xoay điện thoại.
       */

      if (compassHeadingRef.current === null) {
        compassHeadingRef.current = heading;
      } else {
        compassHeadingRef.current = smoothAngle(
          compassHeadingRef.current,
          heading,
          COMPASS_HEADING_SMOOTHING,
        );
      }

      /**
       * Đồng bộ bearing ref.
       */
      smoothedBearingRef.current = compassHeadingRef.current;

      /**
       * ========================================================
       * ROTATE USER MARKER
       * ========================================================
       *
       * Hoàn toàn độc lập với GPS.
       */

      if (userMarkerRef.current) {
        userMarkerRef.current.setRotation(compassHeadingRef.current);
      }

      /**
       * ========================================================
       * ROTATE CAMERA
       * ========================================================
       */

      if (!map) {
        return;
      }

      const now = Date.now();

      if (
        now - lastCompassCameraUpdateRef.current <
        COMPASS_CAMERA_UPDATE_INTERVAL_MS
      ) {
        return;
      }

      lastCompassCameraUpdateRef.current = now;

      /**
       * Camera chỉ xoay khi navigation đang hoạt động.
       *
       * Không thay đổi center ở đây.
       * GPS sẽ chịu trách nhiệm center.
       */

      map.easeTo({
        bearing: compassHeadingRef.current,
        duration: COMPASS_CAMERA_UPDATE_INTERVAL_MS,
        essential: true,
      });
    },
    [getCompassHeading, map],
  );

  /**
   * ============================================================
   * DEVICE ORIENTATION EVENTS
   * ============================================================
   */

  useEffect(() => {
    const handleAbsoluteOrientation = (event: DeviceOrientationEvent) => {
      handleCompassOrientation(event);
    };

    const handleOrientation = (event: DeviceOrientationEvent) => {
      handleCompassOrientation(event);
    };

    /**
     * Android / browsers hỗ trợ absolute orientation.
     */
    window.addEventListener(
      "deviceorientationabsolute",
      handleAbsoluteOrientation,
      true,
    );

    /**
     * iOS / fallback.
     */
    window.addEventListener("deviceorientation", handleOrientation, true);

    return () => {
      window.removeEventListener(
        "deviceorientationabsolute",
        handleAbsoluteOrientation,
        true,
      );

      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, [handleCompassOrientation]);

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

        /**
         * Tốc độ trung bình giả định.
         *
         * 40 km/h.
         */
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
   */

  const updateMarker = useCallback(
    (
      lng: number,
      lat: number,
      heading: number | null,
      accuracy: number,
      speed: number | null,
    ) => {
      if (!map) {
        return;
      }

      const marker = getOrCreateMarker();

      if (!marker) {
        return;
      }

      /**
       * ========================================================
       * ACCURACY
       * ========================================================
       */

      const usableAccuracy = Math.min(
        Math.max(Number.isFinite(accuracy) ? accuracy : 50, 1),
        MAX_ACCEPTABLE_ACCURACY_METERS,
      );

      /**
       * ========================================================
       * POSITION FILTER
       * ========================================================
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
         * GPS speed cho biết đang đứng yên.
         */
        const stationaryBySpeed =
          speed !== null && speed >= 0 && speed < STATIONARY_SPEED_THRESHOLD_MS;

        /**
         * GPS position vẫn nằm trong vùng sai số.
         */
        const stationaryByDistance =
          distanceFromFiltered <=
          Math.max(
            MIN_MOVEMENT_THRESHOLD_METERS,
            usableAccuracy * ACCURACY_MULTIPLIER,
          );

        const isStationary = stationaryBySpeed && stationaryByDistance;

        stationaryRef.current = isStationary;

        /**
         * ======================================================
         * MOVEMENT
         * ======================================================
         */

        if (!isStationary) {
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
       * ========================================================
       * HEADING
       * ========================================================
       *
       * Compass được ưu tiên.
       *
       * GPS heading chỉ là fallback.
       *
       * Không khóa heading khi stationary.
       */

      const compassHeading = compassHeadingRef.current;

      const effectiveHeading =
        compassHeading ?? heading ?? currentHeadingRef.current ?? 0;

      if (smoothedBearingRef.current === null) {
        smoothedBearingRef.current = effectiveHeading;
      } else if (compassHeading === null) {
        /**
         * Chỉ smooth GPS heading khi chưa có compass.
         */
        smoothedBearingRef.current = smoothAngle(
          smoothedBearingRef.current,
          effectiveHeading,
          MOVING_HEADING_SMOOTHING,
        );
      }

      /**
       * ========================================================
       * SET MARKER
       * ========================================================
       */

      marker.setLngLat([smoothedLonRef.current, smoothedLatRef.current]);

      marker.setRotation(
        compassHeadingRef.current ??
          smoothedBearingRef.current ??
          effectiveHeading,
      );

      /**
       * MapLibre Marker chỉ add một lần.
       */

      if (!marker.getElement().parentElement) {
        marker.addTo(map);
      }
    },
    [map, getOrCreateMarker],
  );

  /**
   * ============================================================
   * REROUTE
   * ============================================================
   */

  const performReroute = useCallback(
    async (userLat: number, userLon: number) => {
      const dest = destinationRef.current;

      if (!dest) {
        return;
      }

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
   * CAMERA - GPS POSITION
   * ============================================================
   */

  const updateNavigationCamera = useCallback(
    (heading: number | null) => {
      if (!map) {
        return;
      }

      if (!isNavigatingRef.current) {
        return;
      }

      /**
       * KHÔNG return khi stationary.
       *
       * Compass vẫn cần xoay camera khi người dùng
       * đứng yên và xoay điện thoại.
       */

      const lat = smoothedLatRef.current;

      const lon = smoothedLonRef.current;

      if (lat === null || lon === null) {
        return;
      }

      const now = Date.now();

      /**
       * GPS camera throttle.
       */

      if (now - lastCameraUpdateRef.current < CAMERA_UPDATE_INTERVAL_MS) {
        return;
      }

      /**
       * Nếu marker gần như chưa di chuyển,
       * GPS không cần update camera center.
       *
       * Compass vẫn có thể update bearing
       * thông qua handleCompassOrientation().
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

      /**
       * Compass luôn được ưu tiên.
       */

      const targetBearing =
        compassHeadingRef.current ??
        smoothedBearingRef.current ??
        heading ??
        currentHeadingRef.current ??
        0;

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
   * COMPASS PERMISSION
   * ============================================================
   */

  const requestCompassPermission = useCallback(async () => {
    try {
      /**
       * iOS 13+ yêu cầu permission.
       */

      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof (DeviceOrientationEvent as any).requestPermission === "function"
      ) {
        const permission = await (
          DeviceOrientationEvent as any
        ).requestPermission();

        if (permission !== "granted") {
          console.warn("Người dùng chưa cấp quyền la bàn.");

          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("Không thể xin quyền la bàn:", error);

      return false;
    }
  }, []);

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
     * ========================================================
     * COMPASS PERMISSION
     * ========================================================
     *
     * Hàm này nên được gọi từ click event của nút
     * "Bắt đầu chỉ đường".
     */

    void requestCompassPermission();

    /**
     * ========================================================
     * RESET NAVIGATION
     * ========================================================
     */

    setState((prev) => ({
      ...prev,
      isNavigating: true,
    }));

    isNavigatingRef.current = true;

    lastRerouteAtRef.current = 0;

    lastReroutePosRef.current = null;

    /**
     * ========================================================
     * RESET POSITION SMOOTHING
     * ========================================================
     */

    smoothedLatRef.current = null;

    smoothedLonRef.current = null;

    smoothedBearingRef.current = null;

    compassHeadingRef.current = null;

    currentHeadingRef.current = 0;

    lastRawLatRef.current = null;

    lastRawLonRef.current = null;

    lastGpsTimestampRef.current = null;

    stationaryRef.current = false;

    /**
     * ========================================================
     * RESET CAMERA
     * ========================================================
     */

    lastCameraUpdateRef.current = 0;

    lastCameraLatRef.current = null;

    lastCameraLonRef.current = null;

    lastCompassCameraUpdateRef.current = 0;

    /**
     * ========================================================
     * WAKE LOCK
     * ========================================================
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
              compassHeadingRef.current ??
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
         * Reroute dùng GPS raw.
         */

        void performReroute(latitude, longitude);
      },

      (error) => {
        console.warn("Lỗi lấy vị trí ban đầu:", error);
      },

      {
        enableHighAccuracy: true,

        timeout: 10000,

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
         * Camera sử dụng filtered GPS position.
         *
         * Compass sẽ xử lý bearing riêng.
         */

        updateNavigationCamera(heading);

        /**
         * State vẫn giữ raw GPS.
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
         * Reroute dùng raw GPS.
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
        enableHighAccuracy: true,

        timeout: 15000,

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
    requestCompassPermission,
  ]);

  /**
   * ============================================================
   * STOP NAVIGATION
   * ============================================================
   */

  const stopNavigation = useCallback(() => {
    /**
     * Clear GPS watch.
     */

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
     * ========================================================
     * RESET POSITION
     * ========================================================
     */

    smoothedLatRef.current = null;

    smoothedLonRef.current = null;

    smoothedBearingRef.current = null;

    /**
     * ========================================================
     * RESET COMPASS
     * ========================================================
     */

    compassHeadingRef.current = null;

    currentHeadingRef.current = 0;

    lastCompassCameraUpdateRef.current = 0;

    /**
     * ========================================================
     * RESET GPS
     * ========================================================
     */

    lastRawLatRef.current = null;

    lastRawLonRef.current = null;

    lastGpsTimestampRef.current = null;

    stationaryRef.current = false;

    /**
     * ========================================================
     * RESET CAMERA
     * ========================================================
     */

    lastCameraUpdateRef.current = 0;

    lastCameraLatRef.current = null;

    lastCameraLonRef.current = null;

    /**
     * ========================================================
     * CANCEL REROUTE
     * ========================================================
     */

    isNavigatingRef.current = false;

    rerouteRequestIdRef.current += 1;

    isFetchingRouteRef.current = false;

    lastRerouteAtRef.current = 0;

    lastReroutePosRef.current = null;

    /**
     * ========================================================
     * RELEASE WAKE LOCK
     * ========================================================
     */

    releaseWakeLock();

    /**
     * ========================================================
     * RESET STATE
     * ========================================================
     */

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
     * ========================================================
     * RESET MAP CAMERA
     * ========================================================
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

      isNavigatingRef.current = false;
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
