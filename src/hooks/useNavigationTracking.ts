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

/**
 * Ghép toạ độ đoạn đường CÒN LẠI (đã cắt cục bộ ở client, KHÔNG cần gọi API)
 * vào một RouteGeometry để hiển thị ngay. Dùng ngay mỗi lần có tín hiệu GPS
 * thay vì chỉ chờ performReroute() (gọi API, chỉ chạy mỗi 8-25s) mới cập
 * nhật line — đây là lý do trước đây mũi tên đã đi qua một điểm rồi mà
 * đường vẽ vẫn "quay ngược" về điểm đó: line chỉ cập nhật theo nhịp API,
 * không theo nhịp GPS (vốn nhanh hơn nhiều).
 */
function buildTrimmedLiveRoute(
  fallback: RouteGeometry | null,
  remainingCoordinates: [number, number][] | undefined,
  distanceToDestination: number | null,
  estimatedTimeRemaining: number | null,
): RouteGeometry | null {
  if (!remainingCoordinates || remainingCoordinates.length < 2) {
    return fallback;
  }

  return {
    ...(fallback ?? { distanceKm: 0, durationMinutes: 0, coordinates: [] }),
    coordinates: remainingCoordinates,
    distanceKm: distanceToDestination ?? fallback?.distanceKm ?? 0,
    durationMinutes: estimatedTimeRemaining ?? fallback?.durationMinutes ?? 0,
  };
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
  isFollowing: boolean;
  /**
   * true khi người dùng đã đến điểm đích (trong ngưỡng ARRIVAL_THRESHOLD_METERS).
   * MapExperience dựa vào field này để mở Modal "Bạn đã đến nơi!" — không dùng
   * hệ thống `notification` chung (vốn dành cho các cảnh báo lỗi khác như mất
   * quyền GPS), vì arrival đã có UI Modal riêng đẹp hơn ở MapExperience.tsx.
   */
  hasArrived: boolean;
}

interface NotificationState {
  visible: boolean;
  message: string;
}

/**
 * TRƯỚC ĐÂY: reroute (gọi API TomTom) còn bị kích hoạt theo THỜI GIAN
 * (mỗi 25s dù đứng yên) và theo KHOẢNG CÁCH ĐÃ ĐI (mỗi 40m nếu đã qua ≥8s)
 * — với xe máy đi ~20km/h, 40m chỉ mất ~7s, nghĩa là lúc đang lái BÌNH
 * THƯỜNG (không hề đi lạc) vẫn gọi API gần như liên tục mỗi 8 giây suốt
 * chuyến đi. Một chuyến 3-4 tiếng tốn ~1500-1800 request chỉ để "đi đúng
 * đường" — đây là nguyên nhân chính hết quota nhanh, không phải vì tracking
 * thật sự cần gọi API nhiều đến vậy.
 *
 * SỬA: việc "bám theo vị trí hiện tại" đã được làm HOÀN TOÀN Ở CLIENT bằng
 * cách cắt (turf.lineSlice) đoạn còn lại từ tuyến đã cache trong
 * `routeLineRef` — xem `calculateRemainingDistance` và `buildTrimmedLiveRoute`
 * — không tốn request nào. Vì vậy giờ CHỈ còn duy nhất 1 lý do chính đáng để
 * gọi lại API: người dùng THẬT SỰ đi lệch khỏi tuyến đã cache (rẽ nhầm,
 * không phải nhiễu GPS thoáng qua). 2 hằng số dưới đây thay thế toàn bộ
 * REROUTE_MIN_DISTANCE_METERS/REROUTE_MIN_INTERVAL_MS/REROUTE_MAX_INTERVAL_MS
 * cũ.
 */
// Phải lệch tuyến (isOffRoute=true, tức cách tuyến cache >100m — xem
// calculateRemainingDistance) LIÊN TỤC ít nhất chừng này ms mới coi là đi
// lạc thật, không phải 1 lần định vị nhiễu/GPS nhảy vọt thoáng qua.
const OFFROUTE_CONFIRM_MS = 3000;
// Sau khi đã reroute vì lệch tuyến, chờ tối thiểu chừng này trước khi cho
// phép reroute lần nữa (dù vẫn đang lệch) — tránh gọi API dồn dập nếu tuyến
// mới trả về cũng chưa khớp ngay lập tức với vị trí GPS đang nhảy.
const OFFROUTE_COOLDOWN_MS = 15000;
// Lấy chiều cao màn hình hiện tại để tính chính xác 1/3
const ARRIVAL_THRESHOLD_METERS = 30;

// Khi đang chỉ đường, mũi tên chỉ "bám" (snap) vào tuyến nếu GPS lệch khỏi
// tuyến KHÔNG QUÁ ngưỡng này — đủ để che các trường hợp GPS đô thị lệch vào
// công trình/vỉa hè cạnh đường (thường vài mét đến ~30m), nhưng không đủ để
// che trường hợp rẽ nhầm sang một đường khác hẳn (khi đó nên hiển thị đúng
// vị trí GPS thật, không ép về tuyến cũ đã sai). Cố tình để nhỏ hơn ngưỡng
// isOffRoute (100m, xem calculateRemainingDistance) — off-route thật sự thì
// không nên snap.
const MAX_SNAP_TO_ROUTE_METERS = 35;

const screenHeight = typeof window !== "undefined" ? window.innerHeight : 800;

interface NavigationCameraOptions {
  zoom: number;
  pitch: number;
}

interface LocalRouteComplexity {
  /**
   * Khoảng route được phân tích phía trước người dùng.
   * Không phải tổng quãng đường còn lại.
   */
  lookAheadMeters: number;

  /**
   * Số lần rẽ đáng kể trong đoạn phía trước.
   */
  turnCount: number;

  /**
   * Mức độ thay đổi hướng trung bình.
   */
  turnSeverity: number;

  /**
   * Mức độ phức tạp tổng thể:
   * 0 = rất thẳng
   * 1 = cực kỳ nhiều rẽ
   */
  complexity: number;
}

/**
 * Phân tích ĐOẠN ĐƯỜNG PHÍA TRƯỚC người dùng.
 *
 * Quan trọng:
 * - KHÔNG dựa vào tổng distanceToDestination.
 * - Chỉ xét một cửa sổ route ở phía trước.
 * - Đường càng nhiều lần rẽ -> complexity càng cao.
 * - Đường càng thẳng -> complexity càng thấp.
 *
 * Điều này giúp camera phản ứng đúng với:
 *
 * A ======================== B
 *             ↓
 *       đường thẳng dài
 *
 * hoặc:
 *
 * A ===┐
 *     └===┐
 *         └===┐
 *             └=== B
 *
 * dù tổng quãng đường của hai trường hợp có thể giống nhau.
 */
function normalizeAngle(angle: number): number {
  let result = angle;

  while (result > 180) result -= 360;
  while (result < -180) result += 360;

  return result;
}

function getBearingDifference(bearingA: number, bearingB: number): number {
  return Math.abs(normalizeAngle(bearingB - bearingA));
}

/**
 * Chuyển một `Position` từ geojson (kiểu `number[]`, độ dài không cố định
 * vì geojson cho phép có thêm cao độ) sang tuple `[number, number]` tường
 * minh. Cần thiết vì `sampled` được khai báo là `[number, number][]` —
 * TypeScript không tự suy ra một `Position` bất kỳ luôn đúng 2 phần tử, dù
 * runtime ở đây luôn đúng như vậy (route 2D, không có cao độ).
 */
function toLonLatTuple(
  position: GeoJSON.Position | undefined,
): [number, number] | null {
  if (!position) return null;

  const lon = position[0];
  const lat = position[1];

  if (typeof lon !== "number" || typeof lat !== "number") return null;

  return [lon, lat];
}

/**
 * Phân tích độ phức tạp của ĐOẠN ROUTE SẮP ĐI TỚI.
 *
 * Không quan tâm route còn tổng cộng bao nhiêu km.
 */
function analyzeLocalRouteComplexity(
  routeLine: Feature<LineString> | null,
  userLon: number,
  userLat: number,
): LocalRouteComplexity {
  if (!routeLine || routeLine.geometry.coordinates.length < 2) {
    return {
      lookAheadMeters: 0,
      turnCount: 0,
      turnSeverity: 0,
      complexity: 0,
    };
  }

  try {
    const userPoint = turf.point([userLon, userLat]);

    const nearest = turf.nearestPointOnLine(routeLine, userPoint);

    /**
     * distAlong là khoảng cách từ đầu route tới vị trí
     * hiện tại trên route.
     */
    const distAlongKm =
      typeof nearest.properties.location === "number"
        ? nearest.properties.location
        : 0;

    const totalKm = turf.length(routeLine, {
      units: "kilometers",
    });

    if (!Number.isFinite(totalKm) || totalKm <= 0) {
      return {
        lookAheadMeters: 0,
        turnCount: 0,
        turnSeverity: 0,
        complexity: 0,
      };
    }

    /**
     * Chỉ nhìn tối đa 1.2km phía trước.
     *
     * Đây là điểm quan trọng:
     *
     * route 100km -> vẫn chỉ phân tích 1.2km trước mặt.
     * route 3km   -> cũng chỉ phân tích 1.2km trước mặt.
     */
    const lookAheadKm = Math.min(1.2, Math.max(0, totalKm - distAlongKm));

    if (lookAheadKm < 0.05) {
      return {
        lookAheadMeters: lookAheadKm * 1000,
        turnCount: 0,
        turnSeverity: 0,
        complexity: 0,
      };
    }

    /**
     * lineSliceAlong cho phép lấy chính xác đoạn:
     *
     * current position
     *        ↓
     *        |------ 1.2km ------|
     *
     * thay vì lấy từ đầu route.
     */
    const localRoute = turf.lineSliceAlong(
      routeLine,
      distAlongKm,
      Math.min(distAlongKm + lookAheadKm, totalKm),
      {
        units: "kilometers",
      },
    );

    const coordinates = localRoute.geometry.coordinates;

    if (coordinates.length < 3) {
      return {
        lookAheadMeters: lookAheadKm * 1000,
        turnCount: 0,
        turnSeverity: 0,
        complexity: 0,
      };
    }

    // FIX: coordinates[0] là `Position | undefined` (độ dài không cố định)
    // — chuyển qua toLonLatTuple để có tuple [number, number] chuẩn, dùng
    // được cho mảng sampled bên dưới.
    const firstCoordinate = toLonLatTuple(coordinates[0]);
    if (!firstCoordinate) {
      return {
        lookAheadMeters: lookAheadKm * 1000,
        turnCount: 0,
        turnSeverity: 0,
        complexity: 0,
      };
    }

    /**
     * Route geometry có thể chứa hàng trăm điểm rất gần nhau.
     *
     * Ta lấy sample mỗi khoảng 30m để:
     * - không đếm một góc đường thành nhiều lần rẽ
     * - vẫn phát hiện được các đoạn rẽ trong đô thị.
     */
    const sampled: [number, number][] = [];

    let accumulatedMeters = 0;
    let previous = firstCoordinate;

    sampled.push(previous);

    for (let i = 1; i < coordinates.length; i++) {
      // FIX: coordinates[i] cũng là `Position | undefined` với độ dài không
      // cố định — chuyển qua toLonLatTuple, bỏ qua nếu không hợp lệ.
      const current = toLonLatTuple(coordinates[i]);
      if (!current) continue;

      const segmentMeters = turf.distance(
        turf.point(previous),
        turf.point(current),
        {
          units: "meters",
        },
      );

      accumulatedMeters += segmentMeters;

      if (accumulatedMeters >= 30) {
        sampled.push(current);
        previous = current;
        accumulatedMeters = 0;
      }
    }

    /**
     * Đảm bảo lấy cả điểm cuối.
     */
    // FIX: cùng lý do — chuyển qua toLonLatTuple trước khi so sánh/push vào
    // sampled (giữ nguyên điều kiện so sánh cũ).
    const lastCoordinate = toLonLatTuple(coordinates[coordinates.length - 1]);

    if (
      lastCoordinate &&
      (sampled.length === 0 || sampled[sampled.length - 1] !== lastCoordinate)
    ) {
      sampled.push(lastCoordinate);
    }

    if (sampled.length < 3) {
      return {
        lookAheadMeters: lookAheadKm * 1000,
        turnCount: 0,
        turnSeverity: 0,
        complexity: 0,
      };
    }

    /**
     * Tính bearing của từng đoạn sample.
     */
    const bearings: number[] = [];

    for (let i = 1; i < sampled.length; i++) {
      const from = sampled[i - 1];
      const to = sampled[i];
      // FIX: sampled[i-1]/sampled[i] cũng là `[number, number] | undefined`
      // theo kiểu — bỏ qua cặp điểm này nếu thiếu, không ảnh hưởng các cặp
      // còn lại.
      if (!from || !to) continue;

      const bearing = turf.bearing(turf.point(from), turf.point(to));

      if (Number.isFinite(bearing)) {
        bearings.push(bearing);
      }
    }

    if (bearings.length < 2) {
      return {
        lookAheadMeters: lookAheadKm * 1000,
        turnCount: 0,
        turnSeverity: 0,
        complexity: 0,
      };
    }

    let turnCount = 0;
    let totalTurnSeverity = 0;

    for (let i = 1; i < bearings.length; i++) {
      const previousBearing = bearings[i - 1];
      const currentBearing = bearings[i];
      // FIX: bearings[i-1]/bearings[i] cũng là `number | undefined` theo
      // kiểu — bỏ qua cặp này nếu thiếu.
      if (previousBearing === undefined || currentBearing === undefined) {
        continue;
      }

      const diff = getBearingDifference(previousBearing, currentBearing);

      /**
       * Dưới 30°:
       * coi là đường cong nhẹ, KHÔNG tính là rẽ.
       */
      if (diff < 30) {
        continue;
      }

      turnCount++;

      /**
       * 30° -> 0
       * 60° -> 0.5
       * 90° -> 1
       * 120°+ -> 1
       */
      const severity = Math.min(1, Math.max(0, (diff - 30) / 60));

      totalTurnSeverity += severity;
    }

    /**
     * Số lần rẽ:
     *
     * 0 lần  -> 0
     * 1 lần  -> 0.25
     * 2 lần  -> 0.5
     * 3 lần  -> 0.75
     * >=4    -> 1
     */
    const turnComplexity = Math.min(1, turnCount / 4);

    const turnSeverity =
      turnCount > 0 ? Math.min(1, totalTurnSeverity / turnCount) : 0;

    /**
     * Độ phức tạp tổng:
     *
     * 65% số lần rẽ
     * 35% độ gắt của rẽ.
     */
    const complexity = Math.min(1, turnComplexity * 0.65 + turnSeverity * 0.35);

    return {
      lookAheadMeters: lookAheadKm * 1000,
      turnCount,
      turnSeverity,
      complexity,
    };
  } catch (error) {
    console.warn("Failed to analyze local route complexity:", error);

    return {
      lookAheadMeters: 0,
      turnCount: 0,
      turnSeverity: 0,
      complexity: 0,
    };
  }
}

function getNavigationCamera(complexity: number): NavigationCameraOptions {
  const safeComplexity = Math.max(0, Math.min(1, complexity));

  /**
   * Hiệu chỉnh lại theo đúng cách Google Maps đổi camera khi dẫn đường,
   * dựa trên độ phức tạp CỤC BỘ phía trước (analyzeLocalRouteComplexity,
   * chỉ nhìn ~1.2km trước mặt — không liên quan tổng quãng đường dài hay
   * ngắn), nên trong 1 chuyến đi dài, mỗi đoạn thẳng/đoạn nhiều khúc cua sẽ
   * tự có camera riêng phù hợp:
   *
   * - Đoạn THẲNG, nhìn xa được (complexity ~0): zoom RA XA hơn (zoom thấp,
   *   17.2) + pitch NGHIÊNG SÂU hơn (pitch cao, 78) để thấy một đoạn đường
   *   dài phía trước, giống cảm giác "lướt" trên cao tốc/đường trường.
   * - Đoạn HẺM NGẮN / NHIỀU KHÚC CUA LIÊN TIẾP (complexity ~1): zoom LẠI
   *   GẦN hơn (zoom cao, 19.8) + pitch NGẢ GẦN VỀ NHÌN THẲNG XUỐNG hơn
   *   (pitch thấp, 42) để thấy rõ từng khúc cua sắp tới.
   *
   * Biên độ được nới rộng hơn bản cũ (17.2–19.8 thay vì 19–20.3 cho zoom,
   * 42–78 thay vì 55–80 cho pitch) để sự thay đổi rõ ràng, cảm nhận được
   * khi lái thật, thay vì gần như không đổi như trước.
   */
  const zoom = 17.2 + safeComplexity * 2.8;
  const pitch = 78 - safeComplexity * 46;

  return {
    zoom,
    pitch,
  };
}

/**
 * Khi đang CHỈ ĐƯỜNG (turn-by-turn), mũi tên định vị nên "bám" theo đúng
 * tuyến đường đang đi thay vì hiển thị y nguyên tọa độ GPS thô — vì GPS đô
 * thị có thể lệch vài chục mét (ví dụ báo mũi tên nằm trong một công
 * trình/tòa nhà cạnh đường), điều này vô lý khi đang dẫn đường trên một con
 * đường cụ thể. Chỉ áp dụng "bám đường" khi độ lệch còn trong ngưỡng hợp lý
 * (MAX_SNAP_TO_ROUTE_METERS) — nếu lệch xa hơn (ví dụ rẽ nhầm sang đường
 * khác hẳn), snap về tuyến CŨ sẽ hiển thị SAI vị trí thật, nên lúc đó ưu
 * tiên hiển thị đúng tọa độ GPS thô cho tới khi performReroute() tính xong
 * tuyến mới khớp với vị trí thực.
 *
 * Hàm này CHỈ ảnh hưởng tới vị trí hiển thị của mũi tên trong chế độ chỉ
 * đường (hook này chỉ chạy khi đang navigate) — không ảnh hưởng tới chấm
 * định vị GPS thông thường của MapLibre GeolocateControl khi KHÔNG chỉ
 * đường, vốn nằm hoàn toàn ở MapView.tsx và luôn hiển thị đúng tọa độ GPS
 * thật.
 */
function resolveNavigationMarkerPosition(
  rawLng: number,
  rawLat: number,
  nearestPointOnRoute: [number, number] | null,
  distanceFromRouteMeters: number | null,
): { lng: number; lat: number } {
  if (
    nearestPointOnRoute &&
    distanceFromRouteMeters !== null &&
    distanceFromRouteMeters <= MAX_SNAP_TO_ROUTE_METERS
  ) {
    const [snappedLng, snappedLat] = nearestPointOnRoute;
    if (Number.isFinite(snappedLng) && Number.isFinite(snappedLat)) {
      return { lng: snappedLng, lat: snappedLat };
    }
  }

  return { lng: rawLng, lat: rawLat };
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
    isFollowing: true,
    hasArrived: false,
  });

  // ============================================================
  // NEW: Modal thông báo bằng Tailwind
  // ============================================================
  const [notification, setNotification] = useState<NotificationState>({
    visible: false,
    message: "",
  });

  const showNotification = useCallback((message: string) => {
    setNotification({
      visible: true,
      message,
    });
  }, []);

  const closeNotification = useCallback(() => {
    setNotification({
      visible: false,
      message: "",
    });
  }, []);

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

  // Camera có đang tự động bám theo người dùng hay không.
  // false khi người dùng chủ động vuốt/kéo/zoom/xoay bản đồ.
  const isFollowingRef = useRef(true);

  // Đảm bảo thông báo "Bạn đã đến nơi" chỉ xuất hiện một lần
  // trong mỗi phiên navigation.
  const arrivalNotifiedRef = useRef(false);

  // Đánh dấu camera đang được app điều khiển.
  // Dùng để tránh việc easeTo/flyTo của chính app bị hiểu nhầm
  // là thao tác người dùng.
  const isProgrammaticCameraRef = useRef(false);

  // Timer để reset cờ camera programmatic sau khi animation kết thúc.
  const programmaticCameraTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
  // Mốc thời gian (ms) từ lúc GPS BẮT ĐẦU báo isOffRoute=true liên tục;
  // null nghĩa là hiện đang trên tuyến (on-route). Dùng để yêu cầu lệch
  // tuyến "đủ lâu" (OFFROUTE_CONFIRM_MS) trước khi thật sự gọi API reroute
  // — chỉ 1 lần định vị nhiễu văng ra ngoài 100m rồi quay lại ngay không nên
  // tốn 1 request.
  const offRouteSinceRef = useRef<number | null>(null);
  const rerouteRequestIdRef = useRef(0);

  /**
   * Khi người dùng chủ động tương tác với bản đồ thì thoát chế độ
   * camera tự bám. Marker/GPS/navigation vẫn tiếp tục hoạt động bình thường.
   */
  const disableAutoFollow = useCallback(() => {
    if (isProgrammaticCameraRef.current) return;
    if (!isFollowingRef.current) return;

    isFollowingRef.current = false;

    setState((prev) => ({
      ...prev,
      isFollowing: false,
    }));
  }, []);

  /**
   * Người dùng chủ động điều khiển bản đồ:
   * - kéo
   * - zoom
   * - xoay
   * - thay đổi pitch
   *
   * => tự động thoát chế độ "Về giữa".
   *
   * Chỉ bắt đầu lắng nghe khi có map.
   */
  useEffect(() => {
    if (!map) return;

    const handleUserGesture = () => {
      if (isProgrammaticCameraRef.current) return;

      disableAutoFollow();
    };

    map.on("dragstart", handleUserGesture);
    map.on("zoomstart", handleUserGesture);
    map.on("rotatestart", handleUserGesture);
    map.on("pitchstart", handleUserGesture);

    return () => {
      map.off("dragstart", handleUserGesture);
      map.off("zoomstart", handleUserGesture);
      map.off("rotatestart", handleUserGesture);
      map.off("pitchstart", handleUserGesture);
    };
  }, [map, disableAutoFollow]);

  const getCameraForCurrentRoute = useCallback(
    (userLon: number, userLat: number) => {
      const complexity = analyzeLocalRouteComplexity(
        routeLineRef.current,
        userLon,
        userLat,
      );

      return getNavigationCamera(complexity.complexity);
    },
    [],
  );

  /**
   * Kích hoạt lại camera auto-follow và đưa camera về vị trí hiện tại.
   * Được gọi khi người dùng bấm nút "Về giữa".
   */
  const followUserLocation = useCallback(() => {
    const location = state.userLocation;

    if (!map || !location) return;

    const targetLng = smoothedLonRef.current ?? location.lon;
    const targetLat = smoothedLatRef.current ?? location.lat;

    const targetBearing =
      smoothedBearingRef.current ??
      location.heading ??
      currentHeadingRef.current ??
      0;

    if (!Number.isFinite(targetLng) || !Number.isFinite(targetLat)) {
      return;
    }

    isFollowingRef.current = true;

    setState((prev) => ({
      ...prev,
      isFollowing: true,
    }));

    isProgrammaticCameraRef.current = true;

    if (programmaticCameraTimerRef.current) {
      clearTimeout(programmaticCameraTimerRef.current);
    }

    const camera = getCameraForCurrentRoute(targetLng, targetLat);

    map.easeTo({
      center: [targetLng, targetLat],
      zoom: camera.zoom,
      bearing: targetBearing,
      pitch: camera.pitch,
      duration: 700,
      padding: {
        top: Math.round(screenHeight * 0.33),
        bottom: 0,
        left: 0,
        right: 0,
      },
    });

    programmaticCameraTimerRef.current = setTimeout(() => {
      isProgrammaticCameraRef.current = false;
    }, 800);
  }, [map, state.userLocation, getCameraForCurrentRoute]);

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
          // Trả thêm khoảng cách thô (mét) từ GPS tới tuyến — dùng để quyết
          // định có nên "bám" mũi tên vào tuyến hay không, xem
          // resolveNavigationMarkerPosition().
          distanceFromRouteMeters: distanceFromRoute,
          // Toạ độ đoạn đường CÒN LẠI (đã cắt sẵn từ vị trí hiện tại tới
          // đích) — dùng để cập nhật line hiển thị ngay mỗi lần có GPS mới,
          // không cần đợi API reroute.
          remainingCoordinates: slicedRoute.geometry.coordinates as [
            number,
            number,
          ][],
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
      frameDtSeconds < 0.5;

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
        // Tuyến mới vừa lấy về được coi là "đang bám sát" vị trí hiện tại —
        // reset lại bộ đếm lệch tuyến để không vô tình gọi reroute lần nữa
        // ngay lập tức nếu điểm định vị kế tiếp vẫn tạm thời cách tuyến mới
        // một chút trong lúc GPS ổn định lại.
        offRouteSinceRef.current = null;

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

  /**
   * Quyết định xem có nên gọi lại API tính tuyến hay không. TRƯỚC ĐÂY hàm
   * này còn tính cả "đã đi được bao nhiêu mét" và "đã qua bao lâu" để làm
   * mới tuyến định kỳ dù người dùng vẫn đang đi đúng đường — đó chính là
   * nguồn tốn quota chính (xem giải thích ở OFFROUTE_CONFIRM_MS phía trên).
   *
   * GIỜ: lý do DUY NHẤT để gọi lại API là người dùng thật sự đi lệch khỏi
   * tuyến đã cache (`isOffRoute`, tính hoàn toàn ở client trong
   * calculateRemainingDistance). Yêu cầu lệch tuyến LIÊN TỤC ít nhất
   * OFFROUTE_CONFIRM_MS trước khi coi là thật, tránh việc 1 lần định vị GPS
   * nhảy vọt thoáng qua (rồi tự về đúng ngay fix kế tiếp) làm tốn 1 request.
   * Sau khi đã reroute, phải chờ thêm OFFROUTE_COOLDOWN_MS mới cho phép
   * reroute tiếp, dù vẫn đang báo lệch tuyến.
   */
  const maybeReroute = useCallback(
    (userLat: number, userLon: number, isOffRoute: boolean) => {
      if (!destinationRef.current) return;

      const now = Date.now();

      if (!isOffRoute) {
        // Đang trên tuyến (hoặc đã tự quay lại được) — không có gì để làm.
        offRouteSinceRef.current = null;
        return;
      }

      if (offRouteSinceRef.current === null) {
        // Vừa mới bắt đầu lệch — ghi nhận mốc thời gian, CHƯA reroute vội,
        // chờ xem có thật sự tiếp tục lệch ở lần định vị kế tiếp không.
        offRouteSinceRef.current = now;
        return;
      }

      const offRouteDurationMs = now - offRouteSinceRef.current;
      const timeSinceLastReroute = now - lastRerouteAtRef.current;

      const shouldReroute =
        offRouteDurationMs >= OFFROUTE_CONFIRM_MS &&
        timeSinceLastReroute >= OFFROUTE_COOLDOWN_MS;

      if (shouldReroute) {
        void performReroute(userLat, userLon);
      }
    },
    [performReroute],
  );

  /**
   * Kiểm tra khoảng cách trực tiếp từ vị trí GPS hiện tại tới điểm đến.
   *
   * Không dùng distanceToDestination của route vì route có thể đang được
   * tính lại liên tục. Khoảng cách trực tiếp tới destination ổn định hơn
   * để quyết định thời điểm hiển thị thông báo đã đến nơi.
   */
  const checkArrival = useCallback((userLat: number, userLon: number) => {
    const dest = destinationRef.current;

    if (!dest) return;

    // Đã thông báo rồi thì không thông báo lại dù GPS tiếp tục gửi position.
    if (arrivalNotifiedRef.current) return;

    try {
      const userPoint = turf.point([userLon, userLat]);
      const destinationPoint = turf.point([dest.lon, dest.lat]);

      const distanceMeters = turf.distance(userPoint, destinationPoint, {
        units: "meters",
      });

      if (
        Number.isFinite(distanceMeters) &&
        distanceMeters <= ARRIVAL_THRESHOLD_METERS
      ) {
        arrivalNotifiedRef.current = true;

        // Rung thiết bị nếu browser/device hỗ trợ.
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate([300, 150, 300]);
          } catch {
            // Một số browser có thể từ chối vibration.
          }
        }

        // Bật cờ hasArrived — MapExperience.tsx đã có sẵn Modal "Bạn đã đến
        // nơi!" lắng nghe đúng field này để tự mở, KHÔNG dùng hệ thống
        // notification chung (dành cho lỗi/cảnh báo khác) vì arrival đã có
        // UI riêng đẹp hơn rồi, tránh hiện 2 thông báo chồng nhau.
        setState((prev) => ({ ...prev, hasArrived: true }));
      }
    } catch (err) {
      console.warn("Không thể kiểm tra trạng thái đã đến nơi:", err);
    }
  }, []);

  // Bắt đầu navigation tracking
  const startNavigation = useCallback(() => {
    if (!navigator.geolocation) {
      // ============================================================
      // NEW: Thay alert bằng Modal Tailwind
      // ============================================================
      showNotification("Trình duyệt không hỗ trợ GPS");
      return;
    }

    if (!route) {
      // ============================================================
      // NEW: Thay alert bằng Modal Tailwind
      // ============================================================
      showNotification("Chưa có lộ trình để điều hướng");
      return;
    }

    // Yêu cầu cấp quyền cảm biến la bàn trên iOS (Safari)
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }

    isFollowingRef.current = true;
    isProgrammaticCameraRef.current = false;

    setState((prev) => ({
      ...prev,
      isNavigating: true,
      isFollowing: true,
      hasArrived: false, // chuyến đi mới, phải reset để có thể báo "đến nơi" lại
    }));

    isNavigatingRef.current = true;
    // Reset trạng thái tính-lại-lộ-trình mỗi lần bắt đầu navigate mới.
    lastRerouteAtRef.current = 0;
    offRouteSinceRef.current = null;
    // Đây là một chuyến navigation mới,
    // cho phép hiển thị lại thông báo "Bạn đã đến nơi".
    arrivalNotifiedRef.current = false;

    // Lấy vị trí ngay lập tức (fast-path)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, heading, accuracy, speed } =
          position.coords;
        const remaining = calculateRemainingDistance(latitude, longitude);

        // Bám mũi tên vào tuyến (nếu độ lệch còn hợp lý) — xem
        // resolveNavigationMarkerPosition(). Chỉ ảnh hưởng vị trí HIỂN THỊ
        // của mũi tên, mọi tính toán khác (checkArrival, maybeReroute) vẫn
        // dùng đúng tọa độ GPS thô latitude/longitude như cũ.
        const markerPosition = resolveNavigationMarkerPosition(
          longitude,
          latitude,
          remaining?.nearestPointOnRoute ?? null,
          remaining?.distanceFromRouteMeters ?? null,
        );

        updateMarker(
          markerPosition.lng,
          markerPosition.lat,
          heading,
          accuracy,
          speed,
        );

        if (map && isFollowingRef.current) {
          isProgrammaticCameraRef.current = true;

          const camera = getCameraForCurrentRoute(
            markerPosition.lng,
            markerPosition.lat,
          );

          map.flyTo({
            center: [markerPosition.lng, markerPosition.lat],
            zoom: camera.zoom,
            pitch: camera.pitch,
            bearing: heading ?? currentHeadingRef.current ?? 0,
            duration: 800,
            padding: {
              top: Math.round(screenHeight * 0.33),
              bottom: 0,
              left: 0,
              right: 0,
            },
          });

          if (programmaticCameraTimerRef.current) {
            clearTimeout(programmaticCameraTimerRef.current);
          }

          programmaticCameraTimerRef.current = setTimeout(() => {
            isProgrammaticCameraRef.current = false;
          }, 900);
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
          liveRoute: buildTrimmedLiveRoute(
            prev.liveRoute ?? route,
            remaining?.remainingCoordinates,
            remaining?.distanceToDestination ?? null,
            remaining?.estimatedTimeRemaining ?? null,
          ),
        }));

        // TRƯỚC ĐÂY: luôn gọi performReroute() ngay ở đây, tốn 1 request
        // API bắt buộc mỗi lần bấm "Bắt đầu" dẫn đường — dù vị trí GPS hiện
        // tại gần như luôn trùng khớp với tuyến đã lập kế hoạch (route prop
        // đã được cache sẵn vào routeLineRef từ trước rồi, xem effect "Khởi
        // tạo route line từ Turf.js"). buildTrimmedLiveRoute ở trên đã dùng
        // ngay tuyến cache đó để hiển thị liveRoute, không cần chờ API.
        //
        // GIỜ: chỉ gọi API nếu vị trí GPS thực tế đã lệch khỏi tuyến cache
        // ngay từ đầu (isOffRoute=true) — dùng chung cơ chế xác nhận/cooldown
        // với maybeReroute() để tránh gọi API dư thừa trong trường hợp bình
        // thường (đứng đúng ngay điểm bắt đầu tuyến).
        maybeReroute(latitude, longitude, remaining?.isOffRoute ?? false);
      },
      (error) => {
        console.warn("Lỗi lấy vị trí ban đầu:", error);
      },
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

        // Bám mũi tên vào tuyến (nếu độ lệch còn hợp lý) — xem
        // resolveNavigationMarkerPosition(). checkArrival/maybeReroute bên
        // dưới vẫn dùng đúng tọa độ GPS thô latitude/longitude, không đổi.
        const markerPosition = resolveNavigationMarkerPosition(
          longitude,
          latitude,
          remaining?.nearestPointOnRoute ?? null,
          remaining?.distanceFromRouteMeters ?? null,
        );

        updateMarker(
          markerPosition.lng,
          markerPosition.lat,
          heading,
          accuracy,
          speed,
        );

        checkArrival(latitude, longitude);

        setState((prev) => {
          // Throttle camera updates: chỉ cập nhật camera mỗi 800ms để tránh giật
          const now = Date.now();
          if (
            map &&
            prev.isNavigating &&
            isFollowingRef.current &&
            now - lastCameraUpdateRef.current > 800
          ) {
            lastCameraUpdateRef.current = now;

            // Sử dụng vị trí đã smoothed cho camera
            // Sử dụng vị trí đã smoothed cho camera — vì updateMarker() vừa
            // gọi ở trên nhận markerPosition (đã snap vào tuyến nếu hợp lý)
            // làm input, nên smoothedLonRef/LatRef giờ cũng tự động phản
            // ánh vị trí đã snap, không cần sửa gì thêm ở đây.
            const targetLng = smoothedLonRef.current ?? markerPosition.lng;
            const targetLat = smoothedLatRef.current ?? markerPosition.lat;

            const targetBearing =
              smoothedBearingRef.current ??
              heading ??
              currentHeadingRef.current ??
              0;

            if (
              Number.isFinite(targetLng) &&
              Number.isFinite(targetLat) &&
              Number.isFinite(targetBearing)
            ) {
              isProgrammaticCameraRef.current = true;

              const camera = getCameraForCurrentRoute(targetLng, targetLat);

              map.easeTo({
                center: [targetLng, targetLat],
                zoom: camera.zoom,
                bearing: targetBearing,
                pitch: camera.pitch,
                duration: 750,
                padding: {
                  top: Math.round(screenHeight * 0.33),
                  bottom: 0,
                  left: 0,
                  right: 0,
                },
              });

              if (programmaticCameraTimerRef.current) {
                clearTimeout(programmaticCameraTimerRef.current);
              }

              programmaticCameraTimerRef.current = setTimeout(() => {
                isProgrammaticCameraRef.current = false;
              }, 800);
            }
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
            liveRoute: buildTrimmedLiveRoute(
              prev.liveRoute ?? route,
              remaining?.remainingCoordinates,
              remaining?.distanceToDestination ?? null,
              remaining?.estimatedTimeRemaining ?? null,
            ),
          };
        });

        // Người dùng di chuyển đến đâu, tính lại lộ trình từ đó đến đích —
        // luôn bám sát vị trí thực tế thay vì đường đi cố định ban đầu.
        maybeReroute(latitude, longitude, remaining?.isOffRoute ?? false);
      },
      (error) => {
        console.error("GPS tracking error:", error);
        if (error.code === error.PERMISSION_DENIED) {
          // ============================================================
          // NEW: Thay alert bằng Modal Tailwind
          // ============================================================
          showNotification("Cần quyền truy cập vị trí để điều hướng.");
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
    checkArrival,
    showNotification,
    getCameraForCurrentRoute,
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
    offRouteSinceRef.current = null;

    isFollowingRef.current = false;

    if (programmaticCameraTimerRef.current) {
      clearTimeout(programmaticCameraTimerRef.current);
      programmaticCameraTimerRef.current = null;
    }

    isProgrammaticCameraRef.current = false;

    arrivalNotifiedRef.current = false;

    setState({
      isNavigating: false,
      userLocation: null,
      distanceToDestination: null,
      estimatedTimeRemaining: null,
      nearestPointOnRoute: null,
      isOffRoute: false,
      liveRoute: null,
      isRerouting: false,
      isFollowing: false,
      hasArrived: false,
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
      if (programmaticCameraTimerRef.current) {
        clearTimeout(programmaticCameraTimerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startNavigation,
    stopNavigation,
    followUserLocation,

    // ============================================================
    // NEW: API điều khiển Modal thông báo
    // ============================================================
    notification,
    showNotification,
    closeNotification,
  };
}
