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
function smoothValue(
  currentValue: number,
  newValue: number,
  smoothingFactor = 0.3,
): number {
  return currentValue + smoothingFactor * (newValue - currentValue);
}

/** Làm mượt góc (bearing/heading) với xử lý đặc biệt cho việc vượt qua 0°/360° */
function smoothAngle(
  currentAngle: number,
  newAngle: number,
  smoothingFactor = 0.25,
): number {
  let diff = newAngle - currentAngle;
  // Normalize difference to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  let result = currentAngle + smoothingFactor * diff;
  // Normalize result to [0, 360)
  while (result < 0) result += 360;
  while (result >= 360) result -= 360;

  return result;
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
// Lấy chiều cao màn hình hiện tại để tính chính xác 1/3
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
  const userMarkerMapRef = useRef<MapLibreMap | null>(null);
  const currentHeadingRef = useRef<number>(0);
  // true khi GPS đang di chuyển đủ nhanh để heading GPS đáng tin (xem bước 3
  // trong updateMarker) — lúc đó la bàn không phải nguồn hướng chính. Khi
  // false (đứng yên/đi chậm), la bàn thiết bị mới là nguồn hướng "thật".
  const isGpsHeadingActiveRef = useRef(false);

  // Smoothing refs: lưu vị trí/góc quay "MỤC TIÊU" sau khi đã lọc nhiễu GPS
  // (EMA có trọng số theo độ chính xác). Đây KHÔNG phải là vị trí marker
  // đang hiển thị — vị trí hiển thị thực tế do vòng lặp animateMarker nội
  // suy dần tới đây mỗi khung hình, xem giải thích bên dưới.
  const smoothedLatRef = useRef<number | null>(null);
  const smoothedLonRef = useRef<number | null>(null);
  const smoothedBearingRef = useRef<number | null>(null);
  const lastCameraUpdateRef = useRef<number>(0);

  // Vị trí/góc quay ĐANG HIỂN THỊ trên marker tại khung hình hiện tại — được
  // vòng lặp requestAnimationFrame cập nhật dần mỗi khung hình để "lướt" tới
  // smoothedLat/Lon/BearingRef, thay vì nhảy khựng mỗi lần có tín hiệu GPS
  // mới (đây chính là kỹ thuật giúp Google Maps mượt: nội suy liên tục giữa
  // các lần định vị GPS, thay vì chỉ vẽ lại khi có tín hiệu mới).
  const renderedLatRef = useRef<number | null>(null);
  const renderedLonRef = useRef<number | null>(null);
  const renderedBearingRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Lưu lần đọc GPS thô gần nhất để phát hiện "nhiễu đứng yên": khi người
  // dùng không di chuyển, GPS vẫn dao động vài mét quanh vị trí thật do sai
  // số thiết bị — nếu dịch chuyển quá nhỏ so với độ chính xác báo cáo thì
  // coi là nhiễu và bỏ qua, không cập nhật vị trí mục tiêu.
  const lastRawFixRef = useRef<{ lat: number; lon: number; t: number } | null>(
    null,
  );

  // --- Dead-reckoning (ngoại suy chuyển động giữa 2 lần định vị GPS) ---
  // Trình duyệt/GPS không bắn tọa độ đều đặn theo khung hình (có khi 1-5
  // giây mới có một lần), nên nếu chỉ chờ tín hiệu mới rồi mới di chuyển
  // marker thì chấm định vị sẽ "đứng khựng" giữa 2 lần rồi giật một phát khi
  // có fix mới. Các ref dưới đây lưu vận tốc + hướng di chuyển THỰC (suy ra
  // từ GPS) tại lần fix gần nhất, để vòng lặp animateMarker có thể tự đẩy vị
  // trí MỤC TIÊU tiến tiếp theo thời gian thực giữa các lần fix — đúng kỹ
  // thuật Google Maps/TomTom dùng để tạo cảm giác "trôi" liên tục.
  const lastFixAtRef = useRef<number>(0);
  const extrapolationSpeedRef = useRef<number>(0); // m/s, 0 = không ngoại suy
  const extrapolationBearingRef = useRef<number | null>(null);
  const lastAnimFrameTimeRef = useRef<number>(0);

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
    if (!map) return null;

    // Nếu marker cũ đang tồn tại nhưng thuộc map khác
    // thì loại bỏ hoàn toàn marker cũ.
    if (
      userMarkerRef.current &&
      userMarkerMapRef.current &&
      userMarkerMapRef.current !== map
    ) {
      try {
        userMarkerRef.current.remove();
      } catch {
        // ignore
      }

      userMarkerRef.current = null;
      userMarkerMapRef.current = null;
    }

    if (userMarkerRef.current) {
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
        filter: drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3));
      "
    >
      <svg
        width="112"
        height="112"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="headingConeGradient"
            x1="16"
            y1="18"
            x2="16"
            y2="2"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              offset="0"
              stop-color="#60A5FA"
              stop-opacity="0.05"
            />
            <stop
              offset="1"
              stop-color="#60A5FA"
              stop-opacity="0.55"
            />
          </linearGradient>
        </defs>

        <path
          d="M16 18 L4 4 A18 18 0 0 1 28 4 Z"
          fill="url(#headingConeGradient)"
        />

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

    const marker = new maplibregl.Marker({
      element: el,
      rotationAlignment: "map",
      pitchAlignment: "map",
    });

    userMarkerRef.current = marker;

    return marker;
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

        // TRƯỚC ĐÂY: chỉ set thẳng vào marker ở đây, nhưng animateMarker
        // chạy mỗi khung hình (60fps) lại ghi đè bằng renderedBearingRef
        // đang đuổi theo smoothedBearingRef — mà smoothedBearingRef chỉ
        // được cập nhật trong updateMarker() (tức là theo nhịp GPS, có khi
        // vài giây mới có 1 lần) => la bàn xoay bị "đợi" tới lần GPS tiếp
        // theo mới thấy, gây delay hơn 2 giây như đã gặp.
        //
        // SỬA: khi GPS heading KHÔNG đáng tin (đứng yên/đi chậm), la bàn là
        // nguồn hướng chính — cập nhật thẳng vào smoothedBearingRef ngay khi
        // có sự kiện la bàn mới (nhiều lần/giây), để animateMarker (đang
        // chạy liên tục, không phụ thuộc nhịp GPS) xoay marker theo NGAY,
        // không phải chờ lần định vị GPS kế tiếp nữa.
        if (!isGpsHeadingActiveRef.current) {
          smoothedBearingRef.current = compassHeading;
        }

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

  /**
   * Vòng lặp requestAnimationFrame: mỗi khung hình (~60fps) kéo vị trí/góc
   * quay ĐANG HIỂN THỊ (renderedLat/Lon/BearingRef) tới gần hơn vị trí MỤC
   * TIÊU (smoothedLat/Lon/BearingRef) một chút, rồi mới thật sự gọi
   * marker.setLngLat/setRotation. Nhờ vậy chấm định vị luôn đang "lướt" liên
   * tục thay vì đứng im rồi giật sang vị trí mới mỗi khi trình duyệt bắn ra
   * một tọa độ GPS (vốn không đều, có khi 1-5 giây mới có một lần) — đây là
   * cách Google Maps/TomTom tạo cảm giác mượt: nội suy liên tục giữa các lần
   * định vị thật, chứ không vẽ lại đúng nhịp GPS.
   */
  const animateMarker = useCallback(() => {
    const marker = userMarkerRef.current;
    if (!marker) {
      animationFrameRef.current = null;
      return;
    }

    // ============================================================
    // DEAD-RECKONING: đẩy vị trí MỤC TIÊU (smoothed) tiến thêm theo vận
    // tốc/hướng di chuyển thực gần nhất, dựa trên thời gian thực trôi qua kể
    // từ khung hình trước — để marker tiếp tục "trôi" mượt trong lúc chờ tín
    // hiệu GPS tiếp theo, thay vì đứng yên tại điểm cũ rồi giật khi có fix
    // mới. Chỉ áp dụng khi: (1) thực sự đang di chuyển đủ nhanh, và (2) lần
    // fix GPS gần nhất chưa quá cũ (tránh trôi lung tung nếu mất tín hiệu
    // lâu, ví dụ vào hầm/khuất sóng).
    const nowMs = Date.now();
    const frameDtSeconds = lastAnimFrameTimeRef.current
      ? (nowMs - lastAnimFrameTimeRef.current) / 1000
      : 0;
    lastAnimFrameTimeRef.current = nowMs;

    const msSinceLastFix = lastFixAtRef.current
      ? nowMs - lastFixAtRef.current
      : Infinity;

    const canExtrapolate =
      extrapolationSpeedRef.current > 0.6 &&
      extrapolationBearingRef.current !== null &&
      msSinceLastFix < 4000 &&
      frameDtSeconds > 0 &&
      frameDtSeconds < 0.5; // bỏ qua khung hình bất thường (tab bị ẩn/lag nặng)

    if (
      canExtrapolate &&
      smoothedLatRef.current !== null &&
      smoothedLonRef.current !== null
    ) {
      const distanceKm =
        (extrapolationSpeedRef.current * frameDtSeconds) / 1000;

      if (distanceKm > 0) {
        try {
          const advanced = turf.destination(
            turf.point([smoothedLonRef.current, smoothedLatRef.current]),
            distanceKm,
            extrapolationBearingRef.current as number,
            { units: "kilometers" },
          );
          const [advancedLon, advancedLat] = advanced.geometry.coordinates;

          if (
            typeof advancedLon === "number" &&
            typeof advancedLat === "number" &&
            Number.isFinite(advancedLon) &&
            Number.isFinite(advancedLat)
          ) {
            smoothedLonRef.current = advancedLon;
            smoothedLatRef.current = advancedLat;
          }
        } catch {
          // ignore lỗi ngoại suy, giữ nguyên vị trí mục tiêu hiện tại
        }
      }
    }

    const targetLat = smoothedLatRef.current;
    const targetLon = smoothedLonRef.current;
    const targetBearing = smoothedBearingRef.current;

    if (targetLat !== null && targetLon !== null) {
      if (renderedLatRef.current === null || renderedLonRef.current === null) {
        renderedLatRef.current = targetLat;
        renderedLonRef.current = targetLon;
      } else {
        // Hệ số nội suy mỗi khung hình (không phải hệ số smoothing theo thời
        // gian thực) — đủ nhỏ để chuyển động mềm, đủ lớn để không bị "trễ"
        // so với vị trí thật khi đang di chuyển nhanh.
        const frameLerp = 0.15;
        renderedLatRef.current =
          renderedLatRef.current +
          (targetLat - renderedLatRef.current) * frameLerp;
        renderedLonRef.current =
          renderedLonRef.current +
          (targetLon - renderedLonRef.current) * frameLerp;
      }

      if (targetBearing !== null) {
        renderedBearingRef.current =
          renderedBearingRef.current === null
            ? targetBearing
            : smoothAngle(renderedBearingRef.current, targetBearing, 0.18);
      }

      marker.setLngLat([renderedLonRef.current, renderedLatRef.current]);
      if (renderedBearingRef.current !== null) {
        marker.setRotation(renderedBearingRef.current);
      }
    }

    animationFrameRef.current = requestAnimationFrame(animateMarker);
  }, []);

  // Cập nhật vị trí & hướng MỤC TIÊU của marker theo GPS, có lọc nhiễu —
  // KHÔNG di chuyển marker trực tiếp (việc đó do animateMarker đảm nhiệm).
  const updateMarker = useCallback(
    (
      lng: number,
      lat: number,
      heading: number | null,
      accuracy: number | null = null,
      speed: number | null = null,
    ) => {
      if (!map) return;

      const marker = getOrCreateMarker();
      if (!marker) return;

      const now = Date.now();
      const lastRaw = lastRawFixRef.current;

      const movedFromLastRaw = lastRaw
        ? turf.distance(
            turf.point([lng, lat]),
            turf.point([lastRaw.lon, lastRaw.lat]),
            { units: "meters" },
          )
        : Infinity;

      // ============================================================
      // 1. LỌC NHIỄU GPS
      // ============================================================

      const effectiveAccuracy = Math.max(accuracy ?? 20, 1);

      // GPS báo accuracy càng lớn thì càng phải chống nhiễu mạnh.
      const noiseThreshold = Math.max(2, Math.min(12, effectiveAccuracy * 0.5));

      const isLikelyGpsNoise =
        lastRaw !== null &&
        movedFromLastRaw < noiseThreshold &&
        now - lastRaw.t < 4000;

      lastRawFixRef.current = {
        lat,
        lon: lng,
        t: now,
      };

      if (!isLikelyGpsNoise) {
        // ============================================================
        // 2. SMOOTHING VỊ TRÍ
        // ============================================================

        const accuracyConfidence = Math.max(
          0,
          Math.min(1, 25 / effectiveAccuracy),
        );

        const posSmoothingFactor = 0.18 + 0.32 * accuracyConfidence;

        if (
          smoothedLatRef.current === null ||
          smoothedLonRef.current === null
        ) {
          smoothedLatRef.current = lat;
          smoothedLonRef.current = lng;

          // Quan trọng:
          // Lần đầu tiên phải đặt rendered position ngay lập tức,
          // tránh Marker được addTo() khi chưa có lngLat.
          renderedLatRef.current = lat;
          renderedLonRef.current = lng;
        } else {
          smoothedLatRef.current = smoothValue(
            smoothedLatRef.current,
            lat,
            posSmoothingFactor,
          );

          smoothedLonRef.current = smoothValue(
            smoothedLonRef.current,
            lng,
            posSmoothingFactor,
          );
        }
      }

      // ============================================================
      // 3. XÁC ĐỊNH HEADING
      // ============================================================

      // GPS heading chỉ đáng tin khi xe/người dùng thực sự di chuyển.
      const isMovingFastEnoughForGpsHeading = (speed ?? 0) > 0.6;
      // Cho listener la bàn (deviceorientation) biết GPS có đang "giữ quyền"
      // điều khiển hướng marker hay không, để tránh cả 2 nguồn giành nhau.
      isGpsHeadingActiveRef.current = isMovingFastEnoughForGpsHeading;

      let effectiveHeading: number;

      if (
        isMovingFastEnoughForGpsHeading &&
        heading !== null &&
        Number.isFinite(heading)
      ) {
        effectiveHeading = heading;
      } else if (Number.isFinite(currentHeadingRef.current)) {
        effectiveHeading = currentHeadingRef.current;
      } else {
        effectiveHeading = 0;
      }

      // ============================================================
      // 4. SMOOTH HEADING
      // ============================================================

      if (smoothedBearingRef.current === null) {
        smoothedBearingRef.current = effectiveHeading;
      } else {
        smoothedBearingRef.current = smoothAngle(
          smoothedBearingRef.current,
          effectiveHeading,
          0.2,
        );
      }

      // Ghi lại thời điểm + vận tốc/hướng của lần fix GPS này, để vòng lặp
      // animateMarker (dead-reckoning ở trên) biết còn nên ngoại suy tiếp
      // hay không, và ngoại suy theo hướng nào. Chỉ coi là "đang di chuyển
      // thật" khi GPS heading đáng tin (cùng điều kiện với bước 3 ở trên) —
      // nếu không, đặt speed về 0 để animateMarker không tự trôi lung tung
      // lúc người dùng đứng yên.
      lastFixAtRef.current = now;
      if (isMovingFastEnoughForGpsHeading) {
        extrapolationSpeedRef.current = speed ?? 0;
        extrapolationBearingRef.current = effectiveHeading;
      } else {
        extrapolationSpeedRef.current = 0;
      }

      // ============================================================
      // 5. SET VỊ TRÍ MARKER
      // ============================================================

      const finalLng = renderedLonRef.current ?? smoothedLonRef.current ?? lng;

      const finalLat = renderedLatRef.current ?? smoothedLatRef.current ?? lat;

      // Kiểm tra tuyệt đối tọa độ trước khi đưa vào MapLibre
      if (!Number.isFinite(finalLng) || !Number.isFinite(finalLat)) {
        console.warn("Invalid marker coordinates:", {
          lng,
          lat,
          finalLng,
          finalLat,
        });

        return;
      }

      marker.setLngLat([finalLng, finalLat]);

      // ============================================================
      // 6. ADD MARKER VÀO ĐÚNG MAP
      // ============================================================

      if (userMarkerMapRef.current !== map) {
        // Marker đang thuộc map khác hoặc chưa thuộc map nào.
        marker.addTo(map);

        userMarkerMapRef.current = map;
      }

      // ============================================================
      // 7. SET ROTATION SAU KHI MARKER ĐÃ CÓ VỊ TRÍ + MAP
      // ============================================================

      if (
        smoothedBearingRef.current !== null &&
        Number.isFinite(smoothedBearingRef.current)
      ) {
        marker.setRotation(smoothedBearingRef.current);
      }

      // ============================================================
      // 8. START ANIMATION
      // ============================================================

      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(animateMarker);
      }
    },
    [map, getOrCreateMarker, animateMarker],
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
        const { latitude, longitude, heading, accuracy, speed } =
          position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading, accuracy, speed);

        if (map) {
          map.flyTo({
            center: [longitude, latitude],
            zoom: 19,
            pitch: 80,
            bearing: heading ?? currentHeadingRef.current ?? 0,
            duration: 800,
            // Đẩy điểm center xuống 1/3 phía dưới màn hình
            padding: {
              top: Math.round(screenHeight * 0.33),
              bottom: 0,
              left: 0,
              right: 0,
            },
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
        const { latitude, longitude, heading, accuracy, speed } =
          position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        updateMarker(longitude, latitude, heading, accuracy, speed);

        setState((prev) => {
          // Throttle camera updates: chỉ cập nhật camera mỗi 800ms để tránh giật
          const now = Date.now();
          if (
            map &&
            prev.isNavigating &&
            now - lastCameraUpdateRef.current > 800
          ) {
            lastCameraUpdateRef.current = now;

            // Sử dụng vị trí đã smoothed cho camera
            const targetLng = smoothedLonRef.current ?? longitude;
            const targetLat = smoothedLatRef.current ?? latitude;
            const targetBearing =
              smoothedBearingRef.current ??
              heading ??
              currentHeadingRef.current ??
              0;

            map.easeTo({
              center: [targetLng, targetLat],
              zoom: 19,
              bearing: targetBearing,
              pitch: 80,
              duration: 1000, // Tăng duration lên 1000ms để mượt hơn
              padding: {
                top: Math.round(screenHeight * 0.33),
                bottom: 0,
                left: 0,
                right: 0,
              },
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
        maximumAge: 2000, // ← SỬA TỪ 0 THÀNH 2000ms - CHO PHÉP DÙNG VỊ TRÍ CACHE GẦN ĐÂY
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

    userMarkerMapRef.current = null;

    // Reset smoothing refs
    smoothedLatRef.current = null;
    smoothedLonRef.current = null;
    smoothedBearingRef.current = null;
    isGpsHeadingActiveRef.current = false;
    lastCameraUpdateRef.current = 0;

    // Dừng vòng lặp nội suy vị trí và reset các ref liên quan
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    renderedLatRef.current = null;
    renderedLonRef.current = null;
    renderedBearingRef.current = null;
    lastRawFixRef.current = null;

    // Reset trạng thái dead-reckoning để lần navigate tiếp theo không bị
    // ngoại suy nhầm theo vận tốc/hướng của lần chạy trước.
    lastFixAtRef.current = 0;
    extrapolationSpeedRef.current = 0;
    extrapolationBearingRef.current = null;
    lastAnimFrameTimeRef.current = 0;

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
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startNavigation,
    stopNavigation,
  };
}
