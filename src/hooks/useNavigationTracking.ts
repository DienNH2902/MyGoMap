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
 * Làm mượt giá trị số bằng Exponential Moving Average
 */
function smoothValue(
  currentValue: number,
  newValue: number,
  smoothingFactor = 0.3,
): number {
  return currentValue + smoothingFactor * (newValue - currentValue);
}

/**
 * Làm mượt góc quay, xử lý trường hợp đi qua 0°/360°
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
 * Nội suy tuyến tính
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Nội suy góc theo hướng ngắn nhất.
 */
function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}

/**
 * Ease-out để marker dừng mềm hơn.
 */
function easeOutCubic(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Điểm đến cố định của chuyến đi.
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
 * Cấu hình reroute
 */
const REROUTE_MIN_DISTANCE_METERS = 40;
const REROUTE_MIN_INTERVAL_MS = 8000;
const REROUTE_MAX_INTERVAL_MS = 25000;
const REROUTE_OFFROUTE_MIN_INTERVAL_MS = 4000;

/**
 * Camera navigation
 */
const NAV_CAMERA_ZOOM = 19;
const NAV_CAMERA_PITCH = 80;

/**
 * GPS
 *
 * GPS mobile không phải lúc nào cũng chính xác.
 * Các giá trị này giúp loại bỏ những dao động nhỏ khi người dùng đứng yên.
 */
const GPS_STATIONARY_THRESHOLD_METERS = 8;
const GPS_MAX_JUMP_METERS = 80;
const GPS_MIN_ACCURACY_METERS = 60;

/**
 * Animation marker
 */
const MARKER_ANIMATION_DURATION_MS = 700;

/**
 * Camera chỉ update tối đa khoảng 10 lần / giây.
 */
const CAMERA_UPDATE_INTERVAL_MS = 100;

/**
 * Lấy chiều cao màn hình hiện tại để tính padding.
 */
const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;

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

  /**
   * Đảm bảo marker chỉ được add vào map một lần.
   */
  const markerMountedRef = useRef(false);

  const currentHeadingRef = useRef<number>(0);

  /**
   * GPS smoothing
   */
  const smoothedLatRef = useRef<number | null>(null);
  const smoothedLonRef = useRef<number | null>(null);
  const smoothedBearingRef = useRef<number | null>(null);

  /**
   * GPS thực tế gần nhất được chấp nhận.
   */
  const lastAcceptedGpsRef = useRef<{
    lat: number;
    lon: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);

  /**
   * Vị trí marker đang hiển thị.
   */
  const displayedPositionRef = useRef<{
    lat: number;
    lon: number;
    heading: number;
  } | null>(null);

  /**
   * Animation marker.
   */
  const markerAnimationFrameRef = useRef<number | null>(null);

  const markerAnimationStartRef = useRef<{
    lat: number;
    lon: number;
    heading: number;
  } | null>(null);

  const markerAnimationTargetRef = useRef<{
    lat: number;
    lon: number;
    heading: number;
  } | null>(null);

  /**
   * Camera throttle
   */
  const lastCameraUpdateRef = useRef<number>(0);

  /**
   * Navigation
   */
  const isNavigatingRef = useRef(false);

  const destinationRef = useRef<NavigationDestination | null>(destination);

  destinationRef.current = destination;

  const routeOptionsRef = useRef<RouteOptions>(routeOptions);

  routeOptionsRef.current = routeOptions;

  /**
   * Reroute
   */
  const isFetchingRouteRef = useRef(false);

  const lastRerouteAtRef = useRef(0);

  const lastReroutePosRef = useRef<{
    lat: number;
    lon: number;
  } | null>(null);

  const rerouteRequestIdRef = useRef(0);

  /**
   * Camera follow
   */
  const cameraFollowEnabledRef = useRef(false);

  /**
   * Wake Lock
   */
  const wakeLockRef = useRef<any>(null);

  /**
   * ---------------------------------------------------------
   * WAKE LOCK
   * ---------------------------------------------------------
   *
   * Giữ màn hình sáng trong lúc navigation.
   */
  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && "wakeLock" in navigator) {
        if (!wakeLockRef.current) {
          wakeLockRef.current = await (navigator as any).wakeLock.request(
            "screen",
          );
        }
      }
    } catch (error) {
      console.warn("Không thể giữ màn hình sáng khi dẫn đường:", error);
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release?.().catch(() => {});

      wakeLockRef.current = null;
    }
  }, []);

  /**
   * iOS / Safari có thể tự release Wake Lock khi tab
   * bị hidden.
   *
   * Khi quay lại app -> xin lại.
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
   * ---------------------------------------------------------
   * CREATE NAVIGATION ARROW
   * ---------------------------------------------------------
   *
   * Khi đang chỉ đường:
   * CHỈ tạo mũi tên.
   *
   * Hook này không tạo thêm chấm xanh.
   */
  const getOrCreateMarker = useCallback(() => {
    if (userMarkerRef.current || !map) {
      return userMarkerRef.current;
    }

    const el = document.createElement("div");

    el.className = "user-location-puck";

    el.innerHTML = `
      <div
        style="
          width: 84px;
          height: 84px;
          display: flex;
          align-items: center;
          justify-content: center;
          filter: drop-shadow(
            0px 4px 6px rgba(0, 0, 0, 0.3)
          );
          pointer-events: none;
        "
      >
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
            fill-opacity="0.18"
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

      /**
       * Mũi tên xoay theo map.
       */
      rotationAlignment: "map",

      pitchAlignment: "map",

      /**
       * Cho phép pointer event đi xuyên qua marker.
       *
       * Quan trọng:
       * marker không được chặn thao tác map.
       */
      clickTolerance: 3,
    });

    return userMarkerRef.current;
  }, [map]);

  /**
   * ---------------------------------------------------------
   * DEVICE ORIENTATION
   * ---------------------------------------------------------
   */
  useEffect(() => {
    const handleOrientation = (event: DeviceOrientationEvent) => {
      let compassHeading: number | null = null;

      /**
       * iOS
       */
      if (
        "webkitCompassHeading" in event &&
        typeof (event as any).webkitCompassHeading === "number"
      ) {
        compassHeading = (event as any).webkitCompassHeading;
      } else if (event.alpha !== null) {
        /**
         * Android
         */
        compassHeading = 360 - event.alpha;
      }

      if (compassHeading === null) {
        return;
      }

      currentHeadingRef.current = compassHeading;

      /**
       * Khi đang navigation:
       * heading sẽ được dùng làm hướng mũi tên.
       */
      if (isNavigatingRef.current && markerAnimationTargetRef.current) {
        markerAnimationTargetRef.current = {
          ...markerAnimationTargetRef.current,
          heading: compassHeading,
        };
      } else if (userMarkerRef.current) {
        /**
         * Khi chưa navigation:
         * vẫn giữ behavior cũ của marker.
         */
        userMarkerRef.current.setRotation(compassHeading);
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
   * ---------------------------------------------------------
   * ROUTE LINE
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * CALCULATE REMAINING DISTANCE
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * STOP MARKER ANIMATION
   * ---------------------------------------------------------
   */
  const stopMarkerAnimation = useCallback(() => {
    if (markerAnimationFrameRef.current !== null) {
      cancelAnimationFrame(markerAnimationFrameRef.current);

      markerAnimationFrameRef.current = null;
    }
  }, []);

  /**
   * ---------------------------------------------------------
   * ANIMATE MARKER
   * ---------------------------------------------------------
   */
  const animateMarkerTo = useCallback(
    (lng: number, lat: number, heading: number) => {
      const marker = getOrCreateMarker();

      if (!marker || !map) {
        return;
      }

      stopMarkerAnimation();

      const current = displayedPositionRef.current ?? {
        lat,
        lon: lng,
        heading,
      };

      const start = {
        ...current,
      };

      const target = {
        lat,
        lon: lng,
        heading,
      };

      markerAnimationStartRef.current = start;

      markerAnimationTargetRef.current = target;

      const startedAt = performance.now();

      const animate = (now: number) => {
        const elapsed = now - startedAt;

        const progress = easeOutCubic(elapsed / MARKER_ANIMATION_DURATION_MS);

        const currentLat = lerp(start.lat, target.lat, progress);

        const currentLon = lerp(start.lon, target.lon, progress);

        const currentHeading = lerpAngle(
          start.heading,
          target.heading,
          progress,
        );

        displayedPositionRef.current = {
          lat: currentLat,
          lon: currentLon,
          heading: currentHeading,
        };

        marker.setLngLat([currentLon, currentLat]);

        marker.setRotation(currentHeading);

        /**
         * Camera follow.
         */
        if (isNavigatingRef.current && cameraFollowEnabledRef.current) {
          const nowTime = Date.now();

          if (
            nowTime - lastCameraUpdateRef.current >=
            CAMERA_UPDATE_INTERVAL_MS
          ) {
            lastCameraUpdateRef.current = nowTime;

            map.jumpTo({
              center: [currentLon, currentLat],

              zoom: NAV_CAMERA_ZOOM,

              bearing: currentHeading,

              pitch: NAV_CAMERA_PITCH,

              padding: {
                top: Math.round(screenHeight * 0.33),
                bottom: 0,
                left: 0,
                right: 0,
              },
            });
          }
        }

        if (progress < 1 && isNavigatingRef.current) {
          markerAnimationFrameRef.current = requestAnimationFrame(animate);
        } else {
          markerAnimationFrameRef.current = null;
        }
      };

      markerAnimationFrameRef.current = requestAnimationFrame(animate);
    },
    [getOrCreateMarker, map, stopMarkerAnimation],
  );

  /**
   * ---------------------------------------------------------
   * ENSURE MARKER
   * ---------------------------------------------------------
   */
  const ensureMarkerOnMap = useCallback(() => {
    if (!map) {
      return null;
    }

    const marker = getOrCreateMarker();

    if (!marker) {
      return null;
    }

    if (!markerMountedRef.current) {
      marker.addTo(map);
      markerMountedRef.current = true;
    }

    return marker;
  }, [map, getOrCreateMarker]);

  /**
   * ---------------------------------------------------------
   * FILTER GPS
   * ---------------------------------------------------------
   *
   * Đây là phần quan trọng nhất để xử lý:
   *
   * "Đứng yên nhưng chấm cứ chạy xung quanh."
   */
  const acceptGpsPosition = useCallback(
    (lat: number, lon: number, accuracy: number) => {
      const previous = lastAcceptedGpsRef.current;

      /**
       * GPS accuracy quá tệ.
       *
       * Ví dụ accuracy = 100m thì không nên
       * để marker nhảy theo tọa độ đó.
       */
      if (Number.isFinite(accuracy) && accuracy > GPS_MIN_ACCURACY_METERS) {
        if (previous) {
          return false;
        }
      }

      if (!previous) {
        lastAcceptedGpsRef.current = {
          lat,
          lon,
          accuracy,
          timestamp: Date.now(),
        };

        return true;
      }

      const distance = turf.distance(
        turf.point([previous.lon, previous.lat]),
        turf.point([lon, lat]),
        {
          units: "meters",
        },
      );

      /**
       * Nếu GPS chỉ dao động trong bán kính nhỏ
       * -> coi như người dùng đang đứng yên.
       *
       * Không di chuyển marker.
       */
      if (distance < GPS_STATIONARY_THRESHOLD_METERS) {
        /**
         * Nhưng vẫn cập nhật accuracy tốt hơn.
         */
        if (accuracy < previous.accuracy) {
          lastAcceptedGpsRef.current = {
            ...previous,
            accuracy,
          };
        }

        return false;
      }

      /**
       * Nếu GPS nhảy quá xa trong một lần
       * update -> khả năng cao là GPS outlier.
       */
      const timeDiff = Date.now() - previous.timestamp;

      /**
       * Nếu update rất nhanh mà nhảy > 80m
       * thì bỏ qua.
       */
      if (distance > GPS_MAX_JUMP_METERS && timeDiff < 5000) {
        return false;
      }

      lastAcceptedGpsRef.current = {
        lat,
        lon,
        accuracy,
        timestamp: Date.now(),
      };

      return true;
    },
    [],
  );

  /**
   * ---------------------------------------------------------
   * UPDATE MARKER
   * ---------------------------------------------------------
   */
  const updateMarker = useCallback(
    (lng: number, lat: number, heading: number | null, accuracy: number) => {
      if (!map) {
        return;
      }

      const accepted = acceptGpsPosition(lat, lng, accuracy);

      /**
       * GPS nhiễu -> không di chuyển marker.
       */
      if (!accepted) {
        return;
      }

      const marker = ensureMarkerOnMap();

      if (!marker) {
        return;
      }

      /**
       * Smooth heading.
       */
      const effectiveHeading = heading ?? currentHeadingRef.current ?? 0;

      if (smoothedBearingRef.current === null) {
        smoothedBearingRef.current = effectiveHeading;
      } else {
        smoothedBearingRef.current = smoothAngle(
          smoothedBearingRef.current,
          effectiveHeading,
          0.35,
        );
      }

      /**
       * Smooth coordinate.
       */
      if (smoothedLatRef.current === null || smoothedLonRef.current === null) {
        smoothedLatRef.current = lat;

        smoothedLonRef.current = lng;
      } else {
        smoothedLatRef.current = smoothValue(smoothedLatRef.current, lat, 0.35);

        smoothedLonRef.current = smoothValue(smoothedLonRef.current, lng, 0.35);
      }

      const targetLat = smoothedLatRef.current;

      const targetLon = smoothedLonRef.current;

      const targetHeading = smoothedBearingRef.current;

      if (targetLat === null || targetLon === null || targetHeading === null) {
        return;
      }

      /**
       * Animation marker thay vì nhảy trực tiếp.
       */
      animateMarkerTo(targetLon, targetLat, targetHeading);
    },
    [map, acceptGpsPosition, ensureMarkerOnMap, animateMarkerTo],
  );

  /**
   * ---------------------------------------------------------
   * REROUTE
   * ---------------------------------------------------------
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

        /**
         * Nếu đã có request mới hơn hoặc user
         * đã stop navigation -> bỏ kết quả.
         */
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
   * ---------------------------------------------------------
   * MAYBE REROUTE
   * ---------------------------------------------------------
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
   * ---------------------------------------------------------
   * START NAVIGATION
   * ---------------------------------------------------------
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
     * Bắt đầu navigation NGAY.
     */
    setState((prev) => ({
      ...prev,

      isNavigating: true,

      /**
       * QUAN TRỌNG:
       *
       * Route đã được tìm thấy từ trước.
       *
       * Không chờ API reroute mới bắt đầu
       * chỉ đường.
       */
      liveRoute: route,

      isRerouting: false,
    }));

    isNavigatingRef.current = true;

    /**
     * Reset reroute.
     */
    lastRerouteAtRef.current = 0;

    lastReroutePosRef.current = null;

    rerouteRequestIdRef.current += 1;

    /**
     * Reset GPS smoothing.
     */
    smoothedLatRef.current = null;

    smoothedLonRef.current = null;

    smoothedBearingRef.current = null;

    lastAcceptedGpsRef.current = null;

    displayedPositionRef.current = null;

    lastCameraUpdateRef.current = 0;

    /**
     * Giữ màn hình sáng.
     */
    void acquireWakeLock();

    /**
     * -----------------------------------------------------
     * INITIAL GPS
     * -----------------------------------------------------
     */
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy } = position.coords;

        /**
         * Route đã có sẵn -> tính thông tin
         * trên route hiện tại ngay lập tức.
         */
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading, accuracy);

        /**
         * Camera ban đầu.
         *
         * Không đợi reroute API.
         */
        if (map) {
          map.flyTo({
            center: [longitude, latitude],

            zoom: NAV_CAMERA_ZOOM,

            pitch: NAV_CAMERA_PITCH,

            bearing: heading ?? currentHeadingRef.current ?? 0,

            duration: 500,

            padding: {
              top: Math.round(screenHeight * 0.33),
              bottom: 0,
              left: 0,
              right: 0,
            },
          });

          /**
           * Sau khi flyTo hoàn thành,
           * camera bắt đầu follow GPS.
           */
          setTimeout(() => {
            if (isNavigatingRef.current) {
              cameraFollowEnabledRef.current = true;
            }
          }, 550);
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
         * -------------------------------------------------
         * REROUTE CHẠY NỀN
         * -------------------------------------------------
         *
         * Người dùng đã thấy route ngay.
         *
         * API chỉ cập nhật route mới ở background.
         */
        void performReroute(latitude, longitude);
      },
      (error) => {
        console.warn("Lỗi lấy vị trí ban đầu:", error);
      },
      {
        enableHighAccuracy: true,

        timeout: 5000,

        /**
         * Không dùng cache cũ cho initial fix.
         */
        maximumAge: 0,
      },
    );

    /**
     * -----------------------------------------------------
     * WATCH GPS
     * -----------------------------------------------------
     */
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!isNavigatingRef.current) {
          return;
        }

        const { latitude, longitude, heading, accuracy } = position.coords;

        /**
         * Kiểm tra GPS trước.
         *
         * updateMarker tự bỏ GPS nhiễu.
         */
        const previousGps = lastAcceptedGpsRef.current;

        const previousLat = previousGps?.lat;

        const previousLon = previousGps?.lon;

        let shouldUpdateState = true;

        /**
         * Nếu GPS thay đổi rất nhỏ,
         * coi như người dùng đứng yên.
         */
        if (previousLat !== undefined && previousLon !== undefined) {
          const distance = turf.distance(
            turf.point([previousLon, previousLat]),
            turf.point([longitude, latitude]),
            {
              units: "meters",
            },
          );

          if (distance < GPS_STATIONARY_THRESHOLD_METERS) {
            shouldUpdateState = false;
          }
        }

        /**
         * update marker.
         *
         * Hàm này tự:
         * - loại GPS noise
         * - smooth tọa độ
         * - smooth heading
         * - animate marker
         */
        updateMarker(longitude, latitude, heading, accuracy);

        const remaining = calculateRemainingDistance(latitude, longitude);

        /**
         * Nếu đứng yên:
         *
         * Không cần liên tục setState vị trí
         * để tránh render dư thừa.
         */
        if (shouldUpdateState) {
          setState((prev) => ({
            ...prev,

            userLocation: {
              lat: latitude,
              lon: longitude,
              heading,
              accuracy,
            },

            distanceToDestination:
              remaining?.distanceToDestination ?? prev.distanceToDestination,

            estimatedTimeRemaining:
              remaining?.estimatedTimeRemaining ?? prev.estimatedTimeRemaining,

            nearestPointOnRoute:
              remaining?.nearestPointOnRoute ?? prev.nearestPointOnRoute,

            isOffRoute: remaining?.isOffRoute ?? prev.isOffRoute,
          }));
        }

        /**
         * Reroute theo vị trí.
         *
         * Không reroute từng GPS tick.
         * maybeReroute tự throttle.
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

        timeout: 10000,

        /**
         * Cho phép dùng GPS cache rất gần.
         *
         * Không dùng cache quá cũ.
         */
        maximumAge: 2000,
      },
    );
  }, [
    map,
    route,
    calculateRemainingDistance,
    updateMarker,
    performReroute,
    maybeReroute,
    acquireWakeLock,
  ]);

  /**
   * ---------------------------------------------------------
   * STOP NAVIGATION
   * ---------------------------------------------------------
   */
  const stopNavigation = useCallback(() => {
    /**
     * Stop GPS.
     */
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);

      watchIdRef.current = null;
    }

    /**
     * Stop marker animation.
     */
    stopMarkerAnimation();

    /**
     * Remove navigation arrow.
     */
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();

      userMarkerRef.current = null;
    }

    markerMountedRef.current = false;

    /**
     * Reset smoothing.
     */
    smoothedLatRef.current = null;

    smoothedLonRef.current = null;

    smoothedBearingRef.current = null;

    lastAcceptedGpsRef.current = null;

    displayedPositionRef.current = null;

    markerAnimationStartRef.current = null;

    markerAnimationTargetRef.current = null;

    lastCameraUpdateRef.current = 0;

    cameraFollowEnabledRef.current = false;

    /**
     * Release Wake Lock.
     */
    releaseWakeLock();

    /**
     * Reset navigation.
     */
    isNavigatingRef.current = false;

    /**
     * Cancel pending reroute.
     */
    rerouteRequestIdRef.current += 1;

    isFetchingRouteRef.current = false;

    lastRerouteAtRef.current = 0;

    lastReroutePosRef.current = null;

    /**
     * Reset state.
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
     * Trả camera về trạng thái bình thường.
     */
    if (map) {
      map.easeTo({
        bearing: 0,

        pitch: 0,

        duration: 800,

        padding: {
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
      });
    }
  }, [map, releaseWakeLock, stopMarkerAnimation]);

  /**
   * ---------------------------------------------------------
   * CLEANUP
   * ---------------------------------------------------------
   */
  useEffect(() => {
    return () => {
      isNavigatingRef.current = false;

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);

        watchIdRef.current = null;
      }

      stopMarkerAnimation();

      if (userMarkerRef.current) {
        userMarkerRef.current.remove();

        userMarkerRef.current = null;
      }

      markerMountedRef.current = false;

      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});

        wakeLockRef.current = null;
      }
    };
  }, [stopMarkerAnimation]);

  return {
    ...state,

    startNavigation,

    stopNavigation,
  };
}
