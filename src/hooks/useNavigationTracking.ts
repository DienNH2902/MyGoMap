import { useState, useEffect, useRef, useCallback } from "react";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";
import type { RouteGeometry } from "@/lib/types";
import * as turf from "@turf/turf";
import type { Feature, LineString } from "geojson";
import {
  fetchDrivingRoute,
  type RouteOptions,
} from "@/lib/routing/openRouteService";
import { DEFAULT_MAP_ZOOM } from "@/lib/constants";

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
  offRouteConnector: [[number, number], [number, number]] | null | undefined,
): RouteGeometry | null {
  if (!remainingCoordinates || remainingCoordinates.length < 2) {
    return fallback;
  }

  return {
    ...(fallback ?? { distanceKm: 0, durationMinutes: 0, coordinates: [] }),
    coordinates: remainingCoordinates,
    distanceKm: distanceToDestination ?? fallback?.distanceKm ?? 0,
    durationMinutes: estimatedTimeRemaining ?? fallback?.durationMinutes ?? 0,
    offRouteConnector: offRouteConnector ?? null,
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
   * Tốc độ hiện tại của người dùng, tính bằng km/h, đã được làm mượt (EMA)
   * cùng nguồn với tốc độ dùng để tính camera zoom/pitch (xem
   * smoothedSpeedKmhRef / getNavigationCamera) — để UI hiển thị tốc độ luôn
   * khớp với những gì camera đang "phản ứng". null khi chưa có tín hiệu GPS
   * nào hoặc GPS không báo speed.
   */
  speedKmh: number | null;
  /**
   * true khi người dùng đã đến điểm đích (trong ngưỡng ARRIVAL_THRESHOLD_METERS).
   * MapExperience dựa vào field này để mở Modal "Bạn đã đến nơi!" — không dùng
   * hệ thống `notification` chung (vốn dành cho các cảnh báo lỗi khác như mất
   * quyền GPS), vì arrival đã có UI Modal riêng đẹp hơn ở MapExperience.tsx.
   */
  hasArrived: boolean;
  /** Thông tin popup "đã đến mốc dừng chân" — null khi không hiện. */
  stopArrivalInfo: StopArrivalInfo | null;
}

interface NotificationState {
  visible: boolean;
  message: string;
}

/** Một điểm dừng chân đã lập kế hoạch (customStops từ useRoutePlanner) — thứ
 * tự trong mảng CHÍNH LÀ thứ tự phải đi qua (1, 2, 3...). */
export interface NavigationStopPoint {
  id: string;
  lon: number;
  lat: number;
}

// Trong 50m tính là "đã đến" một mốc dừng chân — ngưỡng RỘNG HƠN
// ARRIVAL_THRESHOLD_METERS (30m, dành cho đích cuối, cần chính xác hơn) vì
// mốc dừng chân là điểm ghé qua tạm, không cần đi sát tuyệt đối.
const STOP_ARRIVAL_THRESHOLD_METERS = 1000;

/** Dữ liệu hiển thị lên popup mỗi khi tới một mốc dừng chân. */
export interface StopArrivalInfo {
  stopOrder: number;
  areaLabel: string;
  traveledKm: number;
  remainingKm: number;
}

// Popup "đã đến mốc dừng chân" tự ẩn sau chừng này.
const STOP_ARRIVAL_NOTIFICATION_DURATION_MS = 10000;

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
// tuyến KHÔNG QUÁ ngưỡng này — đủ để che nhiễu GPS đô thị thông thường
// (vài mét đến ~20m), nhưng KHÔNG được lớn tới mức nuốt luôn khoảng cách
// giữa hai đường chạy song song (đường gom, đường phụ cạnh đường chính,
// dải phân cách...) — nhiều trường hợp thực tế chỉ cách nhau 20-35m. Ngưỡng
// cũ (35m) từng khiến hệ thống "kéo" mũi tên về đường chính dù người dùng
// đã thực sự rẽ sang đường phụ kế bên, gây cảm giác chỉ đường sai. Giảm
// xuống 20m để nghiêm ngặt hơn: chỉ snap khi gần như chắc chắn vẫn đang
// trên đúng con đường đã chỉ.
const MAX_SNAP_TO_ROUTE_METERS = 20;

/**
 * ============================================================
 * PERSIST TRẠNG THÁI "ĐANG DẪN ĐƯỜNG" QUA localStorage
 * ============================================================
 * PWA trên iOS Safari (và một số Android) bị hệ điều hành kill tiến trình
 * sau một khoảng chạy nền/khoá màn hình nhất định (quan sát thực tế: khoảng
 * 15 phút), khiến trang tự tải lại từ đầu — không phải reload chủ động của
 * người dùng. Khi đó hook này mount lại HOÀN TOÀN MỚI, isNavigating luôn
 * bắt đầu lại từ false, và React tự nó không có cách nào "nhớ" được là
 * trước đó đang dẫn đường giữa chừng.
 *
 * Giải pháp: lưu một cờ nhỏ ra NGOÀI React (localStorage) mỗi khi
 * startNavigation()/stopNavigation() được gọi. Lúc hook mount lại (trang
 * tải lại), đọc cờ này MỘT LẦN DUY NHẤT để biết "trước khi bị tải lại có
 * đang dẫn đường hay không", trả ra ngoài qua `wasNavigatingBeforeReload`
 * để component cha (MapExperience) tự gọi lại startNavigation() ngay khi lộ
 * trình (được useRoutePlanner.ts khôi phục riêng) đã sẵn sàng trở lại — coi
 * như người dùng chưa từng bị gián đoạn.
 *
 * CHỈ lưu trạng thái nhỏ gồm đang dẫn đường + đang "Về giữa" + mốc thời gian
 * ở đây — KHÔNG lưu toạ độ/lộ trình, vì lộ trình tĩnh (route/plan) đã được
 * useRoutePlanner.ts lưu riêng rồi;
 * navigation hook chỉ cần biết "có nên tự bấm Bắt đầu lại hay không". Phiên
 * cũ hơn NAVIGATION_SESSION_STORAGE_MAX_AGE_MS bị bỏ qua, tránh việc mở lại
 * app sau nhiều giờ không dùng mà vẫn tự động bật dẫn đường.
 */
const NAVIGATION_SESSION_STORAGE_KEY = "mygomap_navigation_session_v1";
const NAVIGATION_SESSION_STORAGE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 giờ

// Sau khi báo "đã đến nơi", chờ một nhịp ngắn (đủ để rung + Modal kịp hiện)
// rồi tự động dừng hẳn phiên dẫn đường — dừng GPS watch, ẩn marker/line,
// trả camera về bearing/pitch mặc định. Trước đây không có bước này: GPS
// vẫn tiếp tục chạy vô thời hạn sau khi đến nơi, khiến route tiếp tục co
// về gần 0 và dễ rơi vào các trường hợp biên (route quá ngắn, camera vẫn
// "về giữa" một điểm gần như đứng yên) — không có điểm "chốt" rõ ràng cho
// chuyến đi.
const ARRIVAL_AUTO_STOP_DELAY_MS = 1500;

// Khi hướng di chuyển thực tế (GPS heading lúc đang chạy đủ nhanh, hoặc la
// bàn thiết bị lúc đứng yên/đi chậm) lệch QUÁ ngưỡng này so với hướng tuyến
// đường tại vị trí hiện tại — dấu hiệu người dùng đang đi sai/đi ngược
// hướng chỉ dẫn — mũi tên sẽ XOAY THEO HƯỚNG THIẾT BỊ thay vì khoá cứng
// theo tuyến, để không gây hiểu lầm "vẫn đang đi đúng" trong khi thực ra
// đang đi ngược lại. Khi hướng thiết bị quay về lại trong ngưỡng này so
// với tuyến, mũi tên tự khoá lại theo tuyến như bình thường.
const ARROW_HEADING_DEVIATION_THRESHOLD_DEGREES = 130;

interface PersistedNavigationSession {
  isNavigating: boolean;
  isFollowing: boolean;
  updatedAt: number;
  /** Camera lúc lưu — dùng để "Về giữa" sau resume trả về ĐÚNG zoom/pitch/
   *  bearing như trước khi bị tải lại, thay vì tính lại từ đầu với tốc độ
   *  mặc định = 0 (khiến camera nhảy về preset "đứng yên" dù trước đó đang
   *  chạy tốc độ cao). */
  lastZoom?: number;
  lastPitch?: number;
  lastBearing?: number;
  lastSpeedKmh?: number;
  /**
   * Lộ trình MỚI NHẤT sau lần tính lại (reroute) thành công gần nhất — nếu
   * có. KHÁC với plan.route mà useRoutePlanner.ts lưu riêng (đó luôn là
   * tuyến GỐC lúc lập kế hoạch, không đổi dù có reroute hay không).
   *
   * Nếu không lưu trường này: sau khi cố tình đi lệch xa khiến hệ thống
   * reroute thành công, rồi trang bị tải lại giữa chừng (PWA bị kill...),
   * lần resume tiếp theo sẽ dựng lại routeLineRef từ tuyến GỐC (đã lệch)
   * thay vì tuyến ĐÚNG vừa tính — khiến hệ thống lại thấy "lệch tuyến" và
   * tốn thêm 1 request TomTom để reroute lại lần nữa, dù đáp án đúng đã có
   * sẵn từ trước reload.
   */
  liveRoute?: RouteGeometry | null;
  /**
   * ID các mốc dừng chân ĐÃ ĐI QUA (trong ngưỡng STOP_ARRIVAL_THRESHOLD_
   * METERS) trong phiên dẫn đường hiện tại. Lưu lại để nếu trang bị tải lại
   * giữa chừng (PWA bị kill...), lần resume tiếp theo KHÔNG bắt người dùng
   * phải đi qua lại các mốc đã ghé — chỉ còn phải qua các mốc CÒN LẠI.
   */
  visitedStopIds?: string[];
}

function loadPersistedNavigationSession(): PersistedNavigationSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(NAVIGATION_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedNavigationSession>;

    if (
      typeof parsed.updatedAt !== "number" ||
      Date.now() - parsed.updatedAt > NAVIGATION_SESSION_STORAGE_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(NAVIGATION_SESSION_STORAGE_KEY);
      return null;
    }

    const liveRouteRaw = parsed.liveRoute as RouteGeometry | null | undefined;
    const liveRoute =
      liveRouteRaw &&
      Array.isArray(liveRouteRaw.coordinates) &&
      liveRouteRaw.coordinates.length >= 2
        ? liveRouteRaw
        : null;

    return {
      isNavigating: parsed.isNavigating === true,
      isFollowing: parsed.isFollowing !== false,
      updatedAt: parsed.updatedAt,
      lastZoom:
        typeof parsed.lastZoom === "number" ? parsed.lastZoom : undefined,
      lastPitch:
        typeof parsed.lastPitch === "number" ? parsed.lastPitch : undefined,
      lastBearing:
        typeof parsed.lastBearing === "number" ? parsed.lastBearing : undefined,
      lastSpeedKmh:
        typeof parsed.lastSpeedKmh === "number"
          ? parsed.lastSpeedKmh
          : undefined,
      liveRoute,
      visitedStopIds: Array.isArray(parsed.visitedStopIds)
        ? parsed.visitedStopIds.filter(
            (id): id is string => typeof id === "string",
          )
        : undefined,
    };
  } catch (err) {
    console.warn("Không đọc được phiên dẫn đường đã lưu:", err);
    return null;
  }
}

function savePersistedNavigationSession(
  isNavigating: boolean,
  isFollowing = true,
  camera?: {
    zoom?: number;
    pitch?: number;
    bearing?: number;
    speedKmh?: number;
  },
  // undefined = GIỮ NGUYÊN liveRoute đã lưu trước đó (không đụng tới).
  // Chỉ truyền tường minh khi thực sự muốn cập nhật — ví dụ ngay sau một
  // lần reroute thành công (xem performReroute bên dưới).
  liveRoute?: RouteGeometry | null,
  // undefined = GIỮ NGUYÊN visitedStopIds đã lưu trước đó. Chỉ truyền tường
  // minh khi thực sự có thay đổi (một mốc vừa được đánh dấu đã đến).
  visitedStopIds?: string[],
): void {
  if (typeof window === "undefined") return;

  try {
    if (!isNavigating) {
      window.localStorage.removeItem(NAVIGATION_SESSION_STORAGE_KEY);
      return;
    }

    // Đọc lại phiên đã lưu để MERGE — không ghi đè trắng. Trước đây mỗi
    // lần gọi hàm này (camera update, toggle follow...) đều dựng payload
    // mới TỪ ĐẦU chỉ với các trường lần gọi đó biết; các trường không được
    // truyền (ví dụ liveRoute lúc chỉ đang cập nhật camera) bị mất ngay
    // sau một lần ghi tiếp theo — đây chính là lý do lộ trình vừa reroute
    // xong "biến mất" khỏi localStorage chỉ sau chưa đầy 1 giây.
    let existing: Partial<PersistedNavigationSession> = {};
    try {
      const raw = window.localStorage.getItem(NAVIGATION_SESSION_STORAGE_KEY);
      if (raw) {
        existing = JSON.parse(raw) as Partial<PersistedNavigationSession>;
      }
    } catch {
      existing = {};
    }

    const payload: PersistedNavigationSession = {
      isNavigating: true,
      isFollowing,
      updatedAt: Date.now(),
      lastZoom: camera?.zoom ?? existing.lastZoom,
      lastPitch: camera?.pitch ?? existing.lastPitch,
      lastBearing: camera?.bearing ?? existing.lastBearing,
      lastSpeedKmh: camera?.speedKmh ?? existing.lastSpeedKmh,
      liveRoute:
        liveRoute !== undefined ? liveRoute : (existing.liveRoute ?? null),
      visitedStopIds:
        visitedStopIds !== undefined
          ? visitedStopIds
          : (existing.visitedStopIds ?? []),
    };

    window.localStorage.setItem(
      NAVIGATION_SESSION_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch (err) {
    console.warn("Không lưu được phiên dẫn đường:", err);
  }
}

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

interface SpeedCameraKeyframe {
  /** Tốc độ mốc, đơn vị km/h. */
  speedKmh: number;
  zoom: number;
  pitch: number;
}

/**
 * Các mốc (tốc độ -> zoom/pitch NỀN) lấy theo đúng hành vi quan sát được khi
 * dùng Google Maps thực tế khi dẫn đường ô tô/xe máy — TỐC ĐỘ hiện tại mới
 * là yếu tố chính quyết định camera, không phải độ cong đường:
 *
 * Tốc độ           Zoom    Pitch
 * ≤15 km/h         19.3    45°   (đứng yên/hẻm/bãi đỗ — nhìn gần thẳng xuống)
 * ~30 km/h         18.3    55°   (phố đông — zoom vừa)
 * ~60 km/h         17.2    62°   (đường lớn/tỉnh lộ — bắt đầu kéo xa)
 * ~90 km/h         16.2    65°   (quốc lộ nhanh — xa hơn nữa)
 * ≥120 km/h        15.3    66°   (cao tốc — xa nhất, nghiêng sâu để thấy xa)
 */
const SPEED_CAMERA_KEYFRAMES: SpeedCameraKeyframe[] = [
  { speedKmh: 15, zoom: 19.3, pitch: 45 },
  { speedKmh: 30, zoom: 18.3, pitch: 55 },
  { speedKmh: 60, zoom: 17.2, pitch: 62 },
  { speedKmh: 90, zoom: 16.2, pitch: 65 },
  { speedKmh: 120, zoom: 15.3, pitch: 66 },
];

/**
 * Nội suy tuyến tính zoom/pitch NỀN theo tốc độ hiện tại giữa các mốc trong
 * SPEED_CAMERA_KEYFRAMES. Tốc độ ≤ mốc đầu tiên (15 km/h) hoặc ≥ mốc cuối
 * (120 km/h) thì giữ nguyên giá trị ở 2 đầu bảng (clamp), không ngoại suy
 * vượt ra ngoài phạm vi đã quan sát được.
 */
function interpolateSpeedCamera(speedKmh: number): {
  zoom: number;
  pitch: number;
} {
  const safeSpeed = Math.max(0, speedKmh);

  const first = SPEED_CAMERA_KEYFRAMES[0];
  const last = SPEED_CAMERA_KEYFRAMES[SPEED_CAMERA_KEYFRAMES.length - 1];

  // FIX: với tsconfig bật `noUncheckedIndexedAccess`, truy cập mảng theo
  // index luôn trả về kiểu `T | undefined` dù mảng là const cố định và
  // luôn có phần tử — cần guard tường minh trước khi dùng, tương tự cách
  // toLonLatTuple()/các đoạn dùng `sampled[i]` ở trên đã xử lý.
  if (!first || !last) {
    return { zoom: 17.2, pitch: 62 };
  }

  if (safeSpeed <= first.speedKmh) {
    return { zoom: first.zoom, pitch: first.pitch };
  }

  if (safeSpeed >= last.speedKmh) {
    return { zoom: last.zoom, pitch: last.pitch };
  }

  for (let i = 1; i < SPEED_CAMERA_KEYFRAMES.length; i++) {
    const prev = SPEED_CAMERA_KEYFRAMES[i - 1];
    const curr = SPEED_CAMERA_KEYFRAMES[i];

    if (!prev || !curr) continue;

    if (safeSpeed <= curr.speedKmh) {
      const ratio =
        (safeSpeed - prev.speedKmh) / (curr.speedKmh - prev.speedKmh);

      return {
        zoom: prev.zoom + (curr.zoom - prev.zoom) * ratio,
        pitch: prev.pitch + (curr.pitch - prev.pitch) * ratio,
      };
    }
  }

  // Không bao giờ tới đây (đã clamp 2 đầu ở trên) — chỉ để TypeScript yên
  // tâm là luôn có giá trị trả về.
  return { zoom: last.zoom, pitch: last.pitch };
}

function getNavigationCamera(
  speedKmh: number,
  complexity: number,
): NavigationCameraOptions {
  const safeComplexity = Math.max(0, Math.min(1, complexity));

  /**
   * Đúng như cách mọi hệ thống dẫn đường ô tô làm: TỐC ĐỘ hiện tại quyết
   * định camera NỀN (bảng SPEED_CAMERA_KEYFRAMES ở trên) — đi càng nhanh,
   * camera càng zoom xa + nghiêng sâu để thấy đường dài phía trước; đi
   * chậm/đứng yên thì camera zoom gần + nhìn gần như thẳng xuống.
   *
   * Độ phức tạp CỤC BỘ phía trước (analyzeLocalRouteComplexity, chỉ nhìn
   * ~1.2km trước mặt) không còn là yếu tố chính, mà chỉ là một LỚP CỘNG
   * THÊM chồng lên trên nền theo tốc độ: khi sắp tới khúc cua/giao lộ phức
   * tạp, zoom thêm một chút + pitch phẳng thêm một chút so với mức nền,
   * bất kể đang đi tốc độ nào — giống hệt cách Google Maps zoom thêm ngay
   * trước ngã rẽ dù đang chạy tốc độ cao trên quốc lộ.
   */
  const baseline = interpolateSpeedCamera(speedKmh);

  const COMPLEXITY_ZOOM_BOOST = 0.9;
  const COMPLEXITY_PITCH_FLATTEN = 10;

  const zoom = Math.min(
    19.8,
    baseline.zoom + safeComplexity * COMPLEXITY_ZOOM_BOOST,
  );
  const pitch = Math.max(
    40,
    baseline.pitch - safeComplexity * COMPLEXITY_PITCH_FLATTEN,
  );

  return {
    zoom,
    pitch,
  };
}

/**
 * Khi đang CHỈ ĐƯỜNG (turn-by-turn), mũi tên định vị nên "bám" theo đúng
 * tuyến đường đang đi thay vì hiển thị y nguyên tọa độ GPS thô — vì GPS đô
 * thị có thể lệch vài mét (ví dụ báo mũi tên nằm trong một công trình/vỉa
 * hè cạnh đường), điều này vô lý khi đang dẫn đường trên một con đường cụ
 * thể. Chỉ áp dụng "bám đường" khi độ lệch còn RẤT NHỎ (MAX_SNAP_TO_ROUTE_
 * METERS, xem giải thích ở khai báo hằng số) — cố tình để ngưỡng này khá
 * hẹp, đủ để che nhiễu GPS thông thường nhưng KHÔNG đủ để nuốt khoảng cách
 * giữa hai con đường chạy song song. Nếu lệch xa hơn ngưỡng này (ví dụ rẽ
 * hẳn sang một đường khác, kể cả đường phụ song song với tuyến chính), ưu
 * tiên hiển thị đúng tọa độ GPS thô — line dẫn đường lúc này cũng được nối
 * thực từ đúng vị trí này (xem calculateRemainingDistance), nên mũi tên và
 * line luôn khớp nhau, không còn tình trạng "line vẫn ở đường chính, mũi
 * tên lại ở đường phụ kế bên".
 *
 * Việc TÍNH LẠI LỘ TRÌNH MỚI (gọi API performReroute) vẫn CHỈ xảy ra khi
 * lệch tuyến thật sự nhiều (isOffRoute, ngưỡng 100m) và kéo dài liên tục
 * (xem OFFROUTE_CONFIRM_MS/OFFROUTE_COOLDOWN_MS) — đúng yêu cầu: đi đường
 * phụ gần đó chỉ cần vẽ lại line cho đúng thực tế, chỉ khi tiếp tục lệch xa
 * hơn nữa mới cần yêu cầu tuyến mới.
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

function getRouteBearingAtPosition(
  routeLine: Feature<LineString> | null,
  lng: number,
  lat: number,
): number | null {
  if (!routeLine || routeLine.geometry.coordinates.length < 2) {
    return null;
  }

  try {
    const userPoint = turf.point([lng, lat]);

    const nearest = turf.nearestPointOnLine(routeLine, userPoint, {
      units: "meters",
    });

    const coordinates = routeLine.geometry.coordinates;
    const nearestIndex =
      typeof nearest.properties.index === "number"
        ? nearest.properties.index
        : 0;

    const startIndex = Math.max(
      0,
      Math.min(nearestIndex, coordinates.length - 2),
    );

    const from = coordinates[startIndex];
    const to = coordinates[startIndex + 1];

    if (!from || !to) {
      return null;
    }

    const fromLon = from[0];
    const fromLat = from[1];
    const toLon = to[0];
    const toLat = to[1];

    if (
      typeof fromLon !== "number" ||
      typeof fromLat !== "number" ||
      typeof toLon !== "number" ||
      typeof toLat !== "number"
    ) {
      return null;
    }

    const bearing = turf.bearing(
      turf.point([fromLon, fromLat]),
      turf.point([toLon, toLat]),
    );

    if (!Number.isFinite(bearing)) {
      return null;
    }

    return (bearing + 360) % 360;
  } catch {
    return null;
  }
}

/** Lấy nhãn khu vực (huyện, tỉnh) từ toạ độ — dùng chung API Nominatim như
 *  popup click-chọn-điểm trong MapView.tsx. */
async function reverseGeocodeAreaLabel(
  lat: number,
  lon: number,
): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`,
    );
    const data = await res.json();
    const address = data?.address ?? {};
    const district =
      address.county ||
      address.district ||
      address.city_district ||
      address.town ||
      address.suburb;
    const province = address.state || address.city || address.province;
    const parts = [district, province].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : (data?.display_name ?? "");
  } catch {
    return "";
  }
}

export function useNavigationTracking(
  map: MapLibreMap | null,
  route: RouteGeometry | null,
  destination: NavigationDestination | null = null,
  routeOptions: RouteOptions = {},
  stops: NavigationStopPoint[] = [],
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
    speedKmh: null,
    stopArrivalInfo: null,
  });

  // Trạng thái "đang dẫn đường lúc trang bị tải lại" + "đang Về giữa" — chỉ
  // đọc DUY NHẤT MỘT LẦN lúc mount (xem giải thích ở
  // loadPersistedNavigationSession phía trên).
  // MapExperience dựa vào cờ này để tự động gọi lại startNavigation() khi
  // lộ trình đã được khôi phục xong, không cần người dùng bấm lại từ đầu.
  const [persistedNavigationSession] =
    useState<PersistedNavigationSession | null>(() =>
      loadPersistedNavigationSession(),
    );
  const wasNavigatingBeforeReload =
    persistedNavigationSession?.isNavigating ?? false;
  const wasFollowingBeforeReload =
    persistedNavigationSession?.isFollowing ?? true;
  const shouldResumeFollowingRef = useRef(wasNavigatingBeforeReload);

  // Lộ trình đã tính lại (reroute) thành công gần nhất, đọc MỘT LẦN lúc
  // mount — nếu có, dùng ĐÚNG lộ trình này để dựng routeLineRef ngay khi
  // resume, KHÔNG dùng tuyến gốc (đã lệch) — xem giải thích ở
  // PersistedNavigationSession.liveRoute phía trên.
  const resumedLiveRouteRef = useRef<RouteGeometry | null>(
    wasNavigatingBeforeReload
      ? (persistedNavigationSession?.liveRoute ?? null)
      : null,
  );

  const wasUsingDeviceHeadingRef = useRef(false);

  // Camera (zoom/pitch/bearing/tốc độ) tại thời điểm phiên trước bị lưu —
  // CHỈ dùng đúng MỘT LẦN cho lần "về giữa" đầu tiên ngay sau khi resume,
  // để tránh camera nhảy về preset "đứng yên" (tốc độ mặc định = 0) rồi
  // mới từ từ "leo" lên đúng zoom/pitch như trước reload. Sau lần dùng đầu
  // tiên, bị xoá để các lần cập nhật camera tiếp theo quay lại tính động
  // theo tốc độ thực tế như bình thường.
  const resumedCameraRef = useRef<{
    zoom?: number;
    pitch?: number;
    bearing?: number;
    speedKmh?: number;
  } | null>(
    wasNavigatingBeforeReload
      ? {
          zoom: persistedNavigationSession?.lastZoom,
          pitch: persistedNavigationSession?.lastPitch,
          bearing: persistedNavigationSession?.lastBearing,
          speedKmh: persistedNavigationSession?.lastSpeedKmh,
        }
      : null,
  );

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

  const userMarkerElementRef = useRef<HTMLDivElement | null>(null);
  const headingConeElementRef = useRef<HTMLDivElement | null>(null);
  const routeArrowElementRef = useRef<HTMLDivElement | null>(null);

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

  // true khi mũi tên đang ở chế độ "xoay theo hướng thiết bị" (lệch tuyến
  // > ARROW_HEADING_DEVIATION_THRESHOLD_DEGREES) — dùng để chọn hệ số làm
  // mượt NHANH HƠN cho cả smoothedBearingRef lẫn renderedBearingRef (xem
  // animateMarker), vì hệ số 0.3 vốn tối ưu cho việc khoá êm theo tuyến lại
  // gây trễ rõ rệt khi cần xoay gấp theo hướng thiết bị thực tế.
  const arrowUsingDeviceHeadingRef = useRef(false);

  const routeBearingRef = useRef<number | null>(null);
  const lastCameraUpdateRef = useRef<number>(0);
  // Tốc độ hiện tại (km/h) đã làm mượt bằng EMA từ speed GPS (m/s) — dùng
  // làm trục CHÍNH để tính camera zoom/pitch (xem getNavigationCamera) và
  // cũng là nguồn duy nhất cho speedKmh hiển thị lên UI, để camera và số
  // hiển thị luôn khớp nhau, không lệch pha.
  const smoothedSpeedKmhRef = useRef<number | null>(null);

  // Camera có đang tự động bám theo người dùng hay không.
  // false khi người dùng chủ động vuốt/kéo/zoom/xoay bản đồ.
  const isFollowingRef = useRef(true);

  // Đảm bảo thông báo "Bạn đã đến nơi" chỉ xuất hiện một lần
  // trong mỗi phiên navigation.
  const arrivalNotifiedRef = useRef(false);

  const stopArrivalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const stopArrivalRequestIdRef = useRef(0);

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

  // Danh sách mốc dừng chân theo ĐÚNG THỨ TỰ phải đi qua (index trong mảng
  // = thứ tự 1, 2, 3...) — đọc lại mỗi render qua ref để performReroute (và
  // các callback khác dùng useCallback([])) luôn thấy giá trị mới nhất mà
  // không cần liệt kê `stops` vào dependency array (tránh phải re-tạo toàn
  // bộ closure mỗi khi mảng stops đổi tham chiếu).
  const stopsRef = useRef<NavigationStopPoint[]>(stops);
  stopsRef.current = stops;

  // ID các mốc ĐÃ ĐI QUA trong phiên dẫn đường hiện tại. Khởi tạo từ phiên
  // đã lưu CHỈ KHI đang resume sau reload (wasNavigatingBeforeReload) — một
  // lần bấm "Bắt đầu" mới (kể cả bấm lại sau khi đã Dừng) luôn được coi là
  // chuyến đi MỚI, phải đi qua lại từ mốc đầu tiên (xem reset trong
  // startNavigation() bên dưới, cùng logic với arrivalNotifiedRef).
  const visitedStopIdsRef = useRef<Set<string>>(
    new Set(
      wasNavigatingBeforeReload
        ? (persistedNavigationSession?.visitedStopIds ?? [])
        : [],
    ),
  );
  // Đánh dấu đã từng gọi startNavigation() lần nào trong phiên component
  // này chưa — dùng để phân biệt "lần start ĐẦU TIÊN sau khi resume" (giữ
  // nguyên visitedStopIdsRef đã khôi phục) với "mọi lần start khác" (luôn
  // reset về rỗng, coi là chuyến đi mới).
  const hasStartedOnceRef = useRef(false);

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

    if (isNavigatingRef.current) {
      savePersistedNavigationSession(true, false, {
        zoom: map?.getZoom(),
        pitch: map?.getPitch(),
        bearing: map?.getBearing(),
        speedKmh: smoothedSpeedKmhRef.current ?? undefined,
      });
    }
  }, [map]);

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

      return getNavigationCamera(
        smoothedSpeedKmhRef.current ?? 0,
        complexity.complexity,
      );
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

    if (isNavigatingRef.current) {
      savePersistedNavigationSession(true, true, {
        zoom: camera.zoom,
        pitch: camera.pitch,
        bearing: targetBearing,
        speedKmh: smoothedSpeedKmhRef.current ?? undefined,
      });
    }

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
      userMarkerElementRef.current = null;
      headingConeElementRef.current = null;
      routeArrowElementRef.current = null;
    }

    if (userMarkerRef.current) {
      return userMarkerRef.current;
    }

    const el = document.createElement("div");

    el.className = "user-location-puck";

    el.style.width = "84px";
    el.style.height = "84px";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.position = "relative";
    el.style.filter = "drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.3))";

    const headingCone = document.createElement("div");

    headingCone.style.position = "absolute";
    headingCone.style.inset = "0";
    headingCone.style.width = "84px";
    headingCone.style.height = "84px";
    headingCone.style.display = "flex";
    headingCone.style.alignItems = "center";
    headingCone.style.justifyContent = "center";
    headingCone.style.transformOrigin = "center center";
    headingCone.style.willChange = "transform";
    headingCone.style.transform = "scale(1.5)";

    headingCone.innerHTML = `
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
          r="10"
          // fill="#3B82F6"
          fill="rgba(66, 133, 244, 0.18)"
          fill-opacity="0.9"
        />
      </svg>
    `;

    const routeArrow = document.createElement("div");

    routeArrow.style.position = "absolute";
    routeArrow.style.inset = "0";
    routeArrow.style.width = "84px";
    routeArrow.style.height = "84px";
    routeArrow.style.display = "flex";
    routeArrow.style.alignItems = "center";
    routeArrow.style.justifyContent = "center";
    routeArrow.style.transformOrigin = "center center";
    routeArrow.style.willChange = "transform";

    routeArrow.innerHTML = `
      <svg
        width="112"
        height="112"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M16 4L25 24L16 20L7 24L16 4Z"
          fill="#2563EB"
          stroke="#FFFFFF"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </svg>
    `;

    el.appendChild(headingCone);
    el.appendChild(routeArrow);

    userMarkerElementRef.current = el;
    headingConeElementRef.current = headingCone;
    routeArrowElementRef.current = routeArrow;

    const marker = new maplibregl.Marker({
      element: el,
      rotationAlignment: "map",
      pitchAlignment: "map",
    });

    userMarkerRef.current = marker;

    return marker;
  }, [map]);

  // Lắng nghe cảm biến la bàn di động để xoay vùng xanh theo hướng thiết bị
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
        const screenAngle =
          typeof window.screen.orientation?.angle === "number"
            ? window.screen.orientation.angle
            : typeof window.orientation === "number"
              ? window.orientation
              : 0;

        compassHeading = 360 - event.alpha + screenAngle;
      }

      if (compassHeading === null || !Number.isFinite(compassHeading)) {
        return;
      }

      compassHeading = (compassHeading + 360) % 360;

      currentHeadingRef.current = compassHeading;

      if (headingConeElementRef.current) {
        headingConeElementRef.current.style.transform = `rotate(${compassHeading}deg )`;
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
        const isOffRoute = distanceFromRoute > 30;

        const nearestPointCoords = nearestPoint.geometry.coordinates as [
          number,
          number,
        ];

        // Đoạn đường CHÍNH còn lại vẫn LUÔN bắt đầu từ điểm chiếu lên tuyến
        // cache (KHÔNG prepend vị trí GPS thật vào đây nữa) — để tuyến
        // chính hiển thị đúng bản chất "đây là con đường đã lập kế hoạch",
        // không lẫn lộn với đoạn nối chỉ mang tính chỉ dẫn tạm thời.
        const remainingCoordinates = slicedRoute.geometry.coordinates as [
          number,
          number,
        ][];

        // Chỉ tạo đoạn NỐI (offRouteConnector) khi độ lệch GPS thật vượt
        // ngưỡng bám đường — tức mũi tên đang hiển thị đúng toạ độ GPS thô,
        // không bị kéo về tuyến chính (xem resolveNavigationMarkerPosition).
        // MapView.tsx sẽ vẽ riêng đoạn này bằng layer cảnh báo (màu cam,
        // nét đứt) — KHÔNG gộp chung vào tuyến chính để tránh hiểu nhầm đây
        // là một đoạn đường thật.
        const offRouteConnector: [[number, number], [number, number]] | null =
          distanceFromRoute > MAX_SNAP_TO_ROUTE_METERS
            ? [[userLon, userLat], nearestPointCoords]
            : null;

        return {
          distanceToDestination: remainingDistance,
          estimatedTimeRemaining: remainingTime,
          nearestPointOnRoute: nearestPointCoords,
          isOffRoute,
          // Trả thêm khoảng cách thô (mét) từ GPS tới tuyến — dùng để quyết
          // định có nên "bám" mũi tên vào tuyến hay không, xem
          // resolveNavigationMarkerPosition().
          distanceFromRouteMeters: distanceFromRoute,
          remainingCoordinates,
          offRouteConnector,
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

    const nowMs = Date.now();
    const frameDtSeconds = lastAnimFrameTimeRef.current
      ? Math.min(
          0.1,
          Math.max(0, (nowMs - lastAnimFrameTimeRef.current) / 1000),
        )
      : 0;

    lastAnimFrameTimeRef.current = nowMs;

    const msSinceLastFix = lastFixAtRef.current
      ? nowMs - lastFixAtRef.current
      : Infinity;

    const canExtrapolate =
      extrapolationSpeedRef.current > 0.6 &&
      extrapolationBearingRef.current !== null &&
      msSinceLastFix < 10000 &&
      frameDtSeconds > 0;

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
    // Khi đang ở chế độ "xoay theo hướng thiết bị" (lệch tuyến quá
    // ARROW_HEADING_DEVIATION_THRESHOLD_DEGREES), lấy TRỰC TIẾP la bàn
    // thiết bị (currentHeadingRef — được effect deviceorientation cập nhật
    // liên tục ở tần suất cảm biến, thường nhanh hơn NHIỀU so với nhịp GPS
    // fix) làm mục tiêu MỖI KHUNG HÌNH, thay vì đọc smoothedBearingRef.
    //
    // TRƯỚC ĐÂY: dù đang ở chế độ này, mục tiêu vẫn là smoothedBearingRef —
    // giá trị đó CHỈ được updateMarker() làm mới mỗi khi có một tọa độ GPS
    // mới (watchPosition/getCurrentPosition), có thể cách nhau 1-2 giây do
    // maximumAge/tốc độ GPS thực tế. Nghĩa là dù la bàn đã xoay xong từ lâu,
    // mũi tên vẫn "đứng chờ" tới lần GPS fix kế tiếp mới biết để xoay theo —
    // đây chính là nguồn gốc độ trễ ~1s và cảm giác giật/lag được mô tả.
    // Đọc thẳng currentHeadingRef ở đây (chạy mỗi frame, ~60fps) giúp mũi
    // tên bám sát la bàn gần như tức thời, mượt đúng như compass thật.
    const targetBearing = arrowUsingDeviceHeadingRef.current
      ? currentHeadingRef.current
      : smoothedBearingRef.current;

    if (targetLat !== null && targetLon !== null) {
      if (renderedLatRef.current === null || renderedLonRef.current === null) {
        renderedLatRef.current = targetLat;
        renderedLonRef.current = targetLon;
      } else {
        const frameLerp = 0.38;

        renderedLatRef.current =
          renderedLatRef.current +
          (targetLat - renderedLatRef.current) * frameLerp;

        renderedLonRef.current =
          renderedLonRef.current +
          (targetLon - renderedLonRef.current) * frameLerp;
      }

      if (targetBearing !== null) {
        const isUsingDeviceHeading = arrowUsingDeviceHeadingRef.current;

        // Khi vừa quay trở lại vùng bám tuyến (<= 130°):
        // bỏ smooth và bám thẳng ngay theo hướng tuyến.
        const justReturnedToRoute =
          wasUsingDeviceHeadingRef.current && !isUsingDeviceHeading;

        if (justReturnedToRoute) {
          renderedBearingRef.current = targetBearing;
        } else {
          const bearingFrameLerp = isUsingDeviceHeading ? 0.75 : 0.3;

          renderedBearingRef.current =
            renderedBearingRef.current === null
              ? targetBearing
              : smoothAngle(
                  renderedBearingRef.current,
                  targetBearing,
                  bearingFrameLerp,
                );
        }

        wasUsingDeviceHeadingRef.current = isUsingDeviceHeading;
      }

      marker.setLngLat([renderedLonRef.current, renderedLatRef.current]);

      if (renderedBearingRef.current !== null && routeArrowElementRef.current) {
        routeArrowElementRef.current.style.transform = `rotate(${renderedBearingRef.current}deg)`;
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

      const gpsIntervalSeconds =
        lastRaw !== null ? Math.max(0.05, (now - lastRaw.t) / 1000) : 0;

      const calculatedSpeedMps =
        lastRaw !== null &&
        Number.isFinite(movedFromLastRaw) &&
        gpsIntervalSeconds > 0
          ? movedFromLastRaw / gpsIntervalSeconds
          : null;

      const effectiveSpeedMps =
        speed !== null && Number.isFinite(speed) && speed >= 0
          ? speed
          : calculatedSpeedMps;

      const effectiveSpeedKmh =
        effectiveSpeedMps !== null &&
        Number.isFinite(effectiveSpeedMps) &&
        effectiveSpeedMps >= 0
          ? effectiveSpeedMps * 3.6
          : 0;

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
            Math.max(posSmoothingFactor, 0.55),
          );

          smoothedLonRef.current = smoothValue(
            smoothedLonRef.current,
            lng,
            Math.max(posSmoothingFactor, 0.55),
          );
        }
      }

      // ============================================================
      // 2b. XÁC ĐỊNH & LÀM MƯỢT TỐC ĐỘ (km/h)
      // ============================================================
      // speed từ Geolocation API là m/s (hoặc null nếu thiết bị không hỗ
      // trợ) — quy đổi sang km/h rồi làm mượt bằng EMA giống các giá trị
      // khác ở trên, để: (1) camera zoom/pitch theo tốc độ (xem
      // getNavigationCamera) không bị giật mỗi khi GPS báo speed dao động,
      // và (2) số km/h hiển thị lên UI cũng mượt, không nhảy số liên tục.

      const rawSpeedKmh =
        speed !== null && Number.isFinite(speed) && speed >= 0
          ? speed * 3.6
          : 0;

      smoothedSpeedKmhRef.current = effectiveSpeedKmh;

      // ============================================================
      // 3. XÁC ĐỊNH HEADING
      // ============================================================

      // GPS heading dùng cho dead-reckoning vị trí VÀ (mới) để phát hiện
      // người dùng đang đi ngược/đi sai hướng chỉ dẫn — xem bước 3b.
      const isMovingFastEnoughForGpsHeading = (speed ?? 0) > 0.6;

      isGpsHeadingActiveRef.current = isMovingFastEnoughForGpsHeading;

      // ============================================================
      // 3b. XÁC ĐỊNH BEARING CỦA TUYẾN
      // ============================================================

      const routeBearing = getRouteBearingAtPosition(
        routeLineRef.current,
        lng,
        lat,
      );

      if (routeBearing !== null) {
        routeBearingRef.current = routeBearing;
      }

      // Hướng "thiết bị" hiện tại: ưu tiên GPS heading khi đang di chuyển
      // đủ nhanh để tin được, nếu không thì dùng la bàn thiết bị
      // (currentHeadingRef, cập nhật bởi effect deviceorientation phía
      // trên), cuối cùng mới rơi về hướng tuyến nếu không có gì khác.
      let effectiveMovementHeading: number;

      if (
        isMovingFastEnoughForGpsHeading &&
        heading !== null &&
        Number.isFinite(heading)
      ) {
        effectiveMovementHeading = heading;
      } else if (Number.isFinite(currentHeadingRef.current)) {
        effectiveMovementHeading = currentHeadingRef.current;
      } else {
        effectiveMovementHeading = routeBearing ?? 0;
      }

      // ============================================================
      // 3b. XÁC ĐỊNH BEARING CHO MŨI TÊN — khoá theo tuyến, TRỪ KHI hướng
      // thiết bị thực tế lệch quá ARROW_HEADING_DEVIATION_THRESHOLD_DEGREES
      // so với hướng tuyến (đi sai/đi ngược) — lúc đó xoay theo hướng thiết
      // bị thay vì khoá cứng theo tuyến. Quay lại đúng hướng (lệch trong
      // ngưỡng) thì tự khoá lại theo tuyến như cũ.
      // ============================================================

      let targetBearing: number;
      let isUsingDeviceHeading: boolean;

      if (routeBearing !== null) {
        const headingDeviation = getBearingDifference(
          effectiveMovementHeading,
          routeBearing,
        );

        isUsingDeviceHeading =
          headingDeviation > ARROW_HEADING_DEVIATION_THRESHOLD_DEGREES;

        targetBearing = isUsingDeviceHeading
          ? effectiveMovementHeading
          : routeBearing;
      } else {
        // Không có tuyến để khoá theo — coi như luôn ở chế độ theo hướng
        // thiết bị, cần xoay nhanh/chính xác như mọi lúc lệch tuyến khác.
        isUsingDeviceHeading = true;
        targetBearing = effectiveMovementHeading;
      }

      arrowUsingDeviceHeadingRef.current = isUsingDeviceHeading;

      // Theo hướng thiết bị (đi sai/đi ngược) cần xoay NHANH + CHÍNH XÁC
      // hơn hẳn khoá-theo-tuyến — 0.6 thay vì 0.3, giảm độ trễ cảm nhận
      // được từ ~1s xuống gần tức thời, trong khi chế độ khoá-theo-tuyến
      // (đi đúng) vẫn mượt như cũ, không đổi gì.
      const bearingSmoothingFactor = isUsingDeviceHeading ? 0.6 : 0.3;

      if (smoothedBearingRef.current === null) {
        smoothedBearingRef.current = targetBearing;
      } else {
        smoothedBearingRef.current = smoothAngle(
          smoothedBearingRef.current,
          targetBearing,
          bearingSmoothingFactor,
        );
      }

      // GPS heading vẫn được dùng cho dead-reckoning,
      // nhưng KHÔNG dùng để xoay mũi tên.
      // let effectiveMovementHeading: number;

      if (
        isMovingFastEnoughForGpsHeading &&
        heading !== null &&
        Number.isFinite(heading)
      ) {
        effectiveMovementHeading = heading;
      } else if (Number.isFinite(currentHeadingRef.current)) {
        effectiveMovementHeading = currentHeadingRef.current;
      } else {
        effectiveMovementHeading = routeBearing ?? 0;
      }

      // Ghi lại thời điểm + vận tốc/hướng của lần fix GPS này, để vòng lặp
      // animateMarker (dead-reckoning ở trên) biết còn nên ngoại suy tiếp
      // hay không, và ngoại suy theo hướng nào. Chỉ coi là "đang di chuyển
      // thật" khi GPS heading đáng tin (cùng điều kiện với bước 3 ở trên) —
      // nếu không, đặt speed về 0 để animateMarker không tự trôi lung tung
      // lúc người dùng đứng yên.
      lastFixAtRef.current = now;
      if (
        effectiveSpeedMps !== null &&
        Number.isFinite(effectiveSpeedMps) &&
        effectiveSpeedMps > 0.6
      ) {
        extrapolationSpeedRef.current = effectiveSpeedMps ?? 0;
        extrapolationBearingRef.current = effectiveMovementHeading;
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
        Number.isFinite(smoothedBearingRef.current) &&
        routeArrowElementRef.current
      ) {
        routeArrowElementRef.current.style.transform = `rotate(${smoothedBearingRef.current}deg)`;
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
        // CHỈ lấy các mốc dừng chân CHƯA đi qua, giữ NGUYÊN THỨ TỰ ban đầu
        // (1, 2, 3...) — đây chính là phần trước đây bị thiếu: performReroute
        // gọi fetchDrivingRoute() mà không truyền viaPoints nào cả, khiến
        // tuyến tính lại luôn là đường NGẮN NHẤT thẳng tới đích, bỏ qua hoàn
        // toàn các mốc đã lập kế hoạch.
        const remainingStops = stopsRef.current.filter(
          (stop) => !visitedStopIdsRef.current.has(stop.id),
        );

        const newRoute = await fetchDrivingRoute(
          { lon: userLon, lat: userLat },
          { lon: dest.lon, lat: dest.lat },
          routeOptionsRef.current,
          remainingStops.map((stop) => ({ lon: stop.lon, lat: stop.lat })),
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

        savePersistedNavigationSession(
          true,
          isFollowingRef.current,
          undefined,
          newRoute,
        );

        setState((prev) => ({
          ...prev,
          liveRoute: newRoute,
          isRerouting: false,
          // Reroute vừa xong nghĩa là tuyến MỚI bắt đầu chính xác từ vị trí
          // hiện tại — không còn lý do để tiếp tục coi là "đang lệch
          // tuyến". TRƯỚC ĐÂY isOffRoute chỉ được cập nhật lại ở lần
          // watchPosition KẾ TIẾP (có thể cách vài giây), khiến banner "đi
          // sai đường, sẽ tính lại sau vài giây" vẫn hiện thêm một lúc dù
          // đã reroute xong. Đặt false NGAY tại đây để mọi UI phụ thuộc
          // isOffRoute cập nhật tức thì, không cần chờ tick GPS tiếp theo.
          isOffRoute: false,
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
   * Kiểm tra xem người dùng đã tới ĐỦ GẦN mốc dừng chân TIẾP THEO (mốc CHƯA
   * đi qua, gần nhất theo thứ tự) hay chưa. Chỉ kiểm tra mốc kế tiếp — theo
   * đúng nghĩa "đi tuần tự qua từng mốc" (đến mốc 1 mới coi là qua mốc 1,
   * dù có tình cờ đi ngang mốc 2 trước đó cũng không tính). Khi tới đủ gần
   * (STOP_ARRIVAL_THRESHOLD_METERS), đánh dấu đã qua VÀ LƯU NGAY vào
   * localStorage — để performReroute() ở các lần gọi sau (kể cả sau khi
   * trang reload) không còn bắt đi qua lại mốc này nữa.
   */
  const checkStopArrival = useCallback(
    (userLat: number, userLon: number, remainingKm: number | null) => {
      const orderedStops = stopsRef.current;
      if (orderedStops.length === 0) return;

      const nextStopIndex = orderedStops.findIndex(
        (stop) => !visitedStopIdsRef.current.has(stop.id),
      );
      if (nextStopIndex === -1) return; // Đã qua hết mọi mốc.

      const nextStop = orderedStops[nextStopIndex];
      if (!nextStop) return;

      try {
        const distanceMeters = turf.distance(
          turf.point([userLon, userLat]),
          turf.point([nextStop.lon, nextStop.lat]),
          { units: "meters" },
        );

        if (
          Number.isFinite(distanceMeters) &&
          distanceMeters <= STOP_ARRIVAL_THRESHOLD_METERS
        ) {
          visitedStopIdsRef.current.add(nextStop.id);

          if (isNavigatingRef.current) {
            savePersistedNavigationSession(
              true,
              isFollowingRef.current,
              undefined,
              undefined,
              Array.from(visitedStopIdsRef.current),
            );
          }

          // "Đã đi được" = tổng quãng đường lộ trình gốc (route.distanceKm,
          // tuyến TĨNH lúc lập kế hoạch) trừ đi quãng còn lại hiện tại.
          const totalKm = route?.distanceKm ?? null;
          const traveledKm =
            totalKm !== null && remainingKm !== null
              ? Math.max(0, totalKm - remainingKm)
              : 0;

          const requestId = ++stopArrivalRequestIdRef.current;

          setState((prev) => ({
            ...prev,
            stopArrivalInfo: {
              stopOrder: nextStopIndex + 1,
              areaLabel: "Đang xác định khu vực…",
              traveledKm,
              remainingKm: remainingKm ?? 0,
            },
          }));

          if (stopArrivalTimerRef.current) {
            clearTimeout(stopArrivalTimerRef.current);
          }
          stopArrivalTimerRef.current = setTimeout(() => {
            setState((prev) => ({ ...prev, stopArrivalInfo: null }));
          }, STOP_ARRIVAL_NOTIFICATION_DURATION_MS);

          // Tra khu vực (huyện/tỉnh) không đồng bộ — cập nhật lại popup khi có
          // kết quả, bỏ qua nếu trong lúc chờ đã có mốc dừng MỚI HƠN ghi đè.
          void reverseGeocodeAreaLabel(nextStop.lat, nextStop.lon).then(
            (areaLabel) => {
              if (requestId !== stopArrivalRequestIdRef.current) return;
              if (!areaLabel) return;

              setState((prev) =>
                prev.stopArrivalInfo
                  ? {
                      ...prev,
                      stopArrivalInfo: { ...prev.stopArrivalInfo, areaLabel },
                    }
                  : prev,
              );
            },
          );
        }
      } catch (err) {
        console.warn(
          "Không thể kiểm tra trạng thái đã tới mốc dừng chân:",
          err,
        );
      }
    },
    [route],
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

    // Chỉ giữ nguyên các mốc ĐÃ QUA nếu đây là lần start ĐẦU TIÊN sau khi
    // resume từ một phiên dẫn đường bị gián đoạn (PWA bị kill giữa chừng).
    // Mọi lần start khác — kể cả bấm lại "Bắt đầu" sau khi đã bấm "Dừng" —
    // đều coi là MỘT CHUYẾN ĐI MỚI, phải đi qua lại từ mốc đầu tiên (cùng
    // logic với việc reset arrivalNotifiedRef/hasArrived bên dưới).
    const isFirstStartAfterResume =
      !hasStartedOnceRef.current && wasNavigatingBeforeReload;
    hasStartedOnceRef.current = true;

    if (!isFirstStartAfterResume) {
      visitedStopIdsRef.current = new Set();
    }

    // Yêu cầu cấp quyền cảm biến la bàn trên iOS (Safari)
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as any).requestPermission === "function"
    ) {
      (DeviceOrientationEvent as any).requestPermission().catch(console.error);
    }

    const shouldFollow = shouldResumeFollowingRef.current
      ? wasFollowingBeforeReload
      : true;
    shouldResumeFollowingRef.current = false;

    isFollowingRef.current = shouldFollow;
    isProgrammaticCameraRef.current = false;

    // Nếu resume sau reload VÀ trước đó đã từng reroute thành công — dùng
    // lại ĐÚNG lộ trình đó ngay từ đầu. Nếu bỏ qua bước này, routeLineRef
    // vẫn trỏ về tuyến GỐC (đã lệch từ trước reload), khiến hệ thống lại
    // thấy "lệch tuyến" và tốn thêm 1 request TomTom để reroute lần nữa —
    // dù đáp án đúng đã có sẵn.
    const resumedLiveRoute = resumedLiveRouteRef.current;
    if (resumedLiveRoute && resumedLiveRoute.coordinates.length >= 2) {
      try {
        routeLineRef.current = turf.lineString(resumedLiveRoute.coordinates);
      } catch (err) {
        console.warn(
          "Không dựng lại được lộ trình đã tính lại từ phiên trước:",
          err,
        );
      }

      // Coi như vừa reroute xong NGAY LÚC NÀY — mở lại đủ cooldown trước
      // khi cho phép reroute tiếp, tránh GPS dao động nhẹ ngay sau resume
      // vô tình kích hoạt một lần reroute kép không cần thiết.
      lastRerouteAtRef.current = Date.now();
      offRouteSinceRef.current = null;
    }
    // Chỉ dùng đúng MỘT LẦN — các lần bắt đầu navigate tiếp theo trong cùng
    // phiên quay lại tính toán hoàn toàn theo GPS thực tế như bình thường.
    resumedLiveRouteRef.current = null;

    setState((prev) => ({
      ...prev,
      isNavigating: true,
      isFollowing: shouldFollow,
      hasArrived: false, // chuyến đi mới, phải reset để có thể báo "đến nơi" lại
      // Hiển thị ngay lộ trình đã resume lên bản đồ, không cần chờ tick GPS
      // đầu tiên mới có buildTrimmedLiveRoute — tránh một khoảnh khắc bản
      // đồ vẽ nhầm tuyến gốc trước khi kịp cập nhật.
      liveRoute: resumedLiveRoute ?? prev.liveRoute,
    }));

    // Đánh dấu ra localStorage là đang dẫn đường — xem giải thích ở
    // savePersistedNavigationSession phía trên (dùng để tự động resume nếu
    // PWA bị hệ điều hành kill và trang tải lại giữa chừng).
    savePersistedNavigationSession(true, shouldFollow);

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

          const computedCamera = getCameraForCurrentRoute(
            markerPosition.lng,
            markerPosition.lat,
          );

          // Nếu đây là lần "về giữa" ĐẦU TIÊN sau khi resume dẫn đường (PWA
          // bị tải lại giữa chừng), ưu tiên dùng đúng zoom/pitch/bearing/tốc
          // độ đã lưu trước reload — không tính lại từ tốc độ mặc định = 0
          // (khiến camera nhảy về preset "đứng yên" rồi mới từ từ leo lên
          // đúng mức cũ, tạo cảm giác "về giữa" bị sai/lệch so với trước).
          const resumed = resumedCameraRef.current;
          const camera = resumed
            ? {
                zoom: resumed.zoom ?? computedCamera.zoom,
                pitch: resumed.pitch ?? computedCamera.pitch,
              }
            : computedCamera;
          const bearing =
            resumed?.bearing ?? heading ?? currentHeadingRef.current ?? 0;

          if (resumed?.speedKmh != null) {
            smoothedSpeedKmhRef.current = resumed.speedKmh;
          }
          // Chỉ dùng camera đã lưu đúng MỘT LẦN — các lần cập nhật camera
          // tiếp theo (trong watchPosition) quay lại tính động theo tốc độ
          // GPS thực tế như bình thường.
          resumedCameraRef.current = null;

          map.flyTo({
            center: [markerPosition.lng, markerPosition.lat],
            zoom: camera.zoom,
            pitch: camera.pitch,
            bearing,
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

        checkArrival(latitude, longitude);
        checkStopArrival(
          latitude,
          longitude,
          remaining?.distanceToDestination ?? null,
        );

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
            remaining?.offRouteConnector,
          ),
          speedKmh: smoothedSpeedKmhRef.current,
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
        checkStopArrival(
          latitude,
          longitude,
          remaining?.distanceToDestination ?? null,
        );

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

              savePersistedNavigationSession(true, true, {
                zoom: camera.zoom,
                pitch: camera.pitch,
                bearing: targetBearing,
                speedKmh: smoothedSpeedKmhRef.current ?? undefined,
              });

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
              remaining?.offRouteConnector,
            ),
            speedKmh: smoothedSpeedKmhRef.current,
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
    checkStopArrival,
    showNotification,
    getCameraForCurrentRoute,
    wasFollowingBeforeReload,
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

    userMarkerElementRef.current = null;
    headingConeElementRef.current = null;
    routeArrowElementRef.current = null;

    userMarkerMapRef.current = null;

    // Reset smoothing refs
    smoothedLatRef.current = null;
    smoothedLonRef.current = null;
    smoothedBearingRef.current = null;
    routeBearingRef.current = null;
    arrowUsingDeviceHeadingRef.current = false;
    smoothedSpeedKmhRef.current = null;
    isGpsHeadingActiveRef.current = false;
    lastCameraUpdateRef.current = 0;

    isFollowingRef.current = false;
    visitedStopIdsRef.current = new Set();

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

    // Đã dừng dẫn đường chủ động — xoá cờ đã lưu để lần tải trang sau KHÔNG
    // tự động resume phiên này nữa.
    savePersistedNavigationSession(false);

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
      speedKmh: null,
      stopArrivalInfo: null,
    });

    if (map) {
      map.easeTo({
        zoom: 18,
        bearing: 0,
        pitch: 0,
        padding: 0,
        duration: 800,
      });
    }
  }, [map]);

  useEffect(() => {
    if (!state.hasArrived) return;

    const timer = setTimeout(() => {
      stopNavigation();
    }, ARRIVAL_AUTO_STOP_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.hasArrived]);

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
      if (stopArrivalTimerRef.current) {
        clearTimeout(stopArrivalTimerRef.current);
      }
    };
  }, []);

  return {
    ...state,
    startNavigation,
    stopNavigation,
    followUserLocation,
    // Cờ đọc 1 lần lúc mount — xem loadPersistedNavigationSession phía trên.
    // true nghĩa là trang vừa bị tải lại (PWA bị kill...) trong lúc đang
    // dẫn đường; MapExperience dùng cờ này để tự gọi lại startNavigation().
    wasNavigatingBeforeReload,

    // ============================================================
    // NEW: API điều khiển Modal thông báo
    // ============================================================
    notification,
    showNotification,
    closeNotification,
  };
}
