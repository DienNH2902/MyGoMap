import type { TomTomSearchApiResult } from "@/app/api/tomtom/search/route";
import { NOMINATIM_SEARCH_URL } from "../constants";
import type { PlaceResult } from "../types";

export type UserLocationBias = {
  lat: number;
  lon: number;
};

interface TomTomSearchProxyResponse {
  results?: TomTomSearchApiResult[];
  error?: string;
  provider?: string;
  fallbackRecommended?: boolean;
}

interface NominatimItem {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;

  // Các field này dùng để xác định địa điểm hành chính
  // và đưa tỉnh/thành/phường... lên đầu.
  type?: string;
  category?: string;
  class?: string;

  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    suburb?: string;
    city_district?: string;
    district?: string;
    neighbourhood?: string;
    quarter?: string;
    road?: string;
    postcode?: string;
    country?: string;
  };
}

interface NominatimReverseResponse {
  display_name?: string;
}

/**
 * ============================================================
 * NOMINATIM REQUEST CONTROL
 * ============================================================
 *
 * Public Nominatim không dành cho autocomplete tốc độ cao.
 *
 * Giữ khoảng cách tối thiểu giữa các request để tránh:
 *
 *   ERR_CONNECTION_RESET
 *   429
 *   connection dropped
 *
 * Đây là client-side guard, không thay thế rate-limit phía server.
 */

const NOMINATIM_MIN_REQUEST_INTERVAL_MS = 1100;

let lastNominatimRequestAt = 0;

let nominatimRequestQueue: Promise<void> = Promise.resolve();

async function waitForNominatimSlot(signal?: AbortSignal): Promise<void> {
  const run = async () => {
    if (signal?.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }

    const now = Date.now();

    const elapsed = now - lastNominatimRequestAt;

    const waitMs = Math.max(0, NOMINATIM_MIN_REQUEST_INTERVAL_MS - elapsed);

    if (waitMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(resolve, waitMs);

        const onAbort = () => {
          window.clearTimeout(timeout);
          reject(new DOMException("Search aborted", "AbortError"));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }

    if (signal?.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }

    lastNominatimRequestAt = Date.now();
  };

  const next = nominatimRequestQueue.then(run, run);

  nominatimRequestQueue = next.then(
    () => undefined,
    () => undefined,
  );

  await next;
}

/**
 * ============================================================
 * DISTANCE
 * ============================================================
 */

function getDistance(
  lat: number,
  lon: number,
  userLocation: UserLocationBias,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const earthRadius = 6371;

  const dLat = toRadians(lat - userLocation.lat);
  const dLon = toRadians(lon - userLocation.lon);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(userLocation.lat)) *
      Math.cos(toRadians(lat)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadius * c;
}

/**
 * ============================================================
 * ADMINISTRATIVE PRIORITY
 * ============================================================
 *
 * Số càng nhỏ => càng được đưa lên đầu.
 *
 * Mục tiêu:
 *
 * 1. Tỉnh / thành phố
 * 2. Quận / huyện / thị xã
 * 3. Phường / xã / thị trấn
 * 4. Khu phố / neighbourhood
 * 5. POI / địa chỉ
 *
 * Nominatim có nhiều cách biểu diễn type/class nên kiểm tra
 * cả type và class/category.
 */

function getNominatimAdministrativePriority(item: NominatimItem): number {
  const type = item.type?.toLowerCase() ?? "";
  const category = item.category?.toLowerCase() ?? "";
  const itemClass = item.class?.toLowerCase() ?? "";

  /**
   * Tỉnh / thành phố
   */

  if (
    type === "state" ||
    type === "province" ||
    type === "region" ||
    type === "state_district" ||
    type === "city" ||
    type === "town" ||
    type === "municipality"
  ) {
    return 0;
  }

  /**
   * Quận / huyện / thị xã
   */

  if (
    type === "county" ||
    type === "district" ||
    type === "city_district" ||
    type === "municipality_subdivision" ||
    (type === "administrative" &&
      (category === "boundary" || itemClass === "boundary"))
  ) {
    return 1;
  }

  /**
   * Phường / xã / thị trấn
   */
  if (
    type === "suburb" ||
    type === "village" ||
    type === "hamlet" ||
    type === "quarter" ||
    type === "city_block"
  ) {
    return 2;
  }

  /**
   * Khu phố / neighbourhood
   */

  if (type === "neighbourhood" || type === "residential") {
    return 3;
  }

  /**
   * Administrative generic
   */

  if (itemClass === "boundary" && type === "administrative") {
    return 1;
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * ============================================================
 * NOMINATIM RESULT -> PlaceResult
 * ============================================================
 */

function toNominatimPlaceResult(item: NominatimItem): PlaceResult {
  return {
    id: `nominatim-${item.place_id}`,
    label: item.display_name,
    lon: Number(item.lon),
    lat: Number(item.lat),
  };
}

/**
 * ============================================================
 * SORT
 * ============================================================
 *
 * Quy tắc:
 *
 * 1. Địa điểm hành chính luôn đứng trước POI/địa chỉ.
 * 2. Trong cùng cấp hành chính:
 *      -> gần user đứng trước.
 * 3. POI / địa chỉ:
 *      -> gần user đứng trước.
 * 4. Không có GPS:
 *      -> giữ nguyên thứ tự Nominatim trả về.
 *
 * Không slice().
 * Không giới hạn lại ở frontend.
 */

function sortNominatimResults(
  items: NominatimItem[],
  userLocation?: UserLocationBias | null,
): NominatimItem[] {
  return items
    .map((item, index) => ({
      item,
      index,
      priority: getNominatimAdministrativePriority(item),
      distance: userLocation
        ? getDistance(Number(item.lat), Number(item.lon), userLocation)
        : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      /**
       * Administrative luôn đứng trước normal.
       */
      const aIsAdmin = Number.isFinite(a.priority);
      const bIsAdmin = Number.isFinite(b.priority);

      if (aIsAdmin && !bIsAdmin) {
        return -1;
      }

      if (!aIsAdmin && bIsAdmin) {
        return 1;
      }

      /**
       * Cả hai đều là administrative.
       */
      if (aIsAdmin && bIsAdmin) {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        if (userLocation) {
          return a.distance - b.distance;
        }

        return a.index - b.index;
      }

      /**
       * Cả hai đều là POI / địa chỉ.
       */
      if (userLocation) {
        return a.distance - b.distance;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * ============================================================
 * NOMINATIM SEARCH
 * ============================================================
 *
 * Dùng cho:
 *
 * - autocomplete
 * - fallback khi TomTom lỗi / hết quota
 *
 * KHÔNG gọi TomTom.
 *
 * Quan trọng:
 *
 * - debounce nằm ở component
 * - service tự rate-limit tối thiểu ~1.1s
 * - giới hạn 5 kết quả giống implementation cũ
 * - dùng format=json giống implementation cũ
 */

export async function searchWithNominatim(
  query: string,
  signal?: AbortSignal,
  userLocation?: UserLocationBias | null,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  await waitForNominatimSlot(signal);

  if (signal?.aborted) {
    throw new DOMException("Search aborted", "AbortError");
  }

  const url = new URL(NOMINATIM_SEARCH_URL);

  /**
   * ============================================================
   * QUERY
   * ============================================================
   *
   * Giữ cách query cũ:
   *
   *   cafe
   *   cafe*
   *
   * Cách này đang hoạt động tốt với Nominatim của bạn.
   */
  url.searchParams.set("q", `${trimmed}*`);

  /**
   * ============================================================
   * FORMAT
   * ============================================================
   */
  url.searchParams.set("format", "json");

  /**
   * ============================================================
   * VIỆT NAM
   * ============================================================
   */
  url.searchParams.set("countrycodes", "vn");

  /**
   * ============================================================
   * LANGUAGE
   * ============================================================
   */
  url.searchParams.set("accept-language", "vi");

  /**
   * ============================================================
   * RESULT LIMIT
   * ============================================================
   *
   * Public Nominatim không nên trả quá nhiều kết quả.
   *
   * 5 kết quả là đủ cho dropdown.
   */
  // url.searchParams.set("limit", "5");

  /**
   * ============================================================
   * CẬP NHẬT: TĂNG SỐ ỨNG VIÊN CHO TỪ KHOÁ CHUNG (vd: "cafe")
   * ============================================================
   *
   * Nominatim mặc định chỉ trả về khoảng 10 kết quả có "importance"
   * cao nhất trên TOÀN QUỐC. Với từ khoá chung như "cafe", "quán ăn"...,
   * các quán nổi tiếng / nhiều dữ liệu OSM ở tỉnh khác dễ chiếm hết
   * 10 suất đó, khiến quán thực sự ở gần user còn chưa kịp có mặt
   * trong danh sách để sortNominatimResults() phía dưới sắp xếp lại —
   * dù logic sort theo khoảng cách bên dưới vốn đã đúng.
   *
   * Tăng limit lên để có đủ ứng viên gần user lọt vào danh sách, rồi
   * sortNominatimResults() sẽ xếp:
   *
   *   - Tên tỉnh / thành phố / quận huyện / phường xã (administrative)
   *     -> luôn lên đầu, bất kể khoảng cách.
   *   - Còn lại (cafe, quán ăn, ATM...)
   *     -> ưu tiên theo khoảng cách tới user, thay vì các quán ở
   *        tỉnh khác dù "nổi tiếng" hơn trên Nominatim.
   */
  url.searchParams.set("limit", "20");

  /**
   * ============================================================
   * LOCATION BIAS
   * ============================================================
   *
   * Đây là phần quan trọng.
   *
   * Nếu userLocation tồn tại:
   *
   *      user
   *        ↓
   *      tạo bounding box ~30 km
   *        ↓
   *      Nominatim ưu tiên khu vực này
   *
   * Ví dụ user ở TP.HCM:
   *
   *      cafe
   *
   * sẽ ưu tiên:
   *
   *      Cafe gần user
   *      ↓
   *      Cafe trong TP.HCM
   *      ↓
   *      các kết quả VN khác nếu cần
   *
   * bounded=0 rất quan trọng:
   *
   * - 0 = ưu tiên viewbox nhưng KHÔNG giới hạn tuyệt đối
   * - nếu không có kết quả gần user, Nominatim vẫn được phép
   *   tìm ở nơi khác.
   */

  if (userLocation) {
    /**
     * Khoảng cách tìm kiếm ưu tiên: ~30 km.
     *
     * 1 độ latitude ≈ 111 km.
     *
     * Latitude:
     *   30 / 111 ≈ 0.27°
     *
     * Longitude phụ thuộc latitude.
     * Việt Nam nằm khoảng 8-23°N nên dùng công thức
     * cos(latitude) để tính chính xác hơn.
     */
    const radiusKm = 30;

    const latDelta = radiusKm / 111;

    const latRadians = (userLocation.lat * Math.PI) / 180;

    const kmPerLongitudeDegree = 111 * Math.cos(latRadians);

    const lonDelta = radiusKm / Math.max(kmPerLongitudeDegree, 1);

    const left = userLocation.lon - lonDelta;
    const right = userLocation.lon + lonDelta;
    const top = userLocation.lat + latDelta;
    const bottom = userLocation.lat - latDelta;

    /**
     * Nominatim viewbox:
     *
     * left,top,right,bottom
     */
    url.searchParams.set("viewbox", `${left},${top},${right},${bottom}`);

    /**
     * Không ép bounded.
     *
     * Nominatim sẽ ưu tiên viewbox nhưng vẫn có thể
     * tìm ngoài khu vực nếu cần.
     */
    url.searchParams.set("bounded", "0");
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "MyGoMapApp/1.0",
      },
      cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }

    console.warn("Nominatim network error:", error);

    return [];
  }

  if (!response.ok) {
    console.warn(`Nominatim returned HTTP ${response.status}`);

    return [];
  }

  let items: NominatimItem[];

  try {
    items = (await response.json()) as NominatimItem[];
  } catch {
    return [];
  }

  /**
   * ============================================================
   * VALID COORDINATES
   * ============================================================
   */
  const validItems = items.filter((item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);

    return Number.isFinite(lat) && Number.isFinite(lon);
  });

  /**
   * ============================================================
   * FINAL SORT
   * ============================================================
   *
   * Viewbox giúp Nominatim ưu tiên khu vực user.
   *
   * Sort tiếp lần nữa ở client để đảm bảo:
   *
   * 1. Administrative priority
   * 2. Khoảng cách tới user
   *
   * được áp dụng nhất quán.
   */
  const sortedItems = sortNominatimResults(validItems, userLocation);

  return sortedItems.map(toNominatimPlaceResult);
}

/**
 * ============================================================
 * TOMTOM REQUEST
 * ============================================================
 *
 * CHỈ gọi khi user:
 *
 * - click Search
 * - Enter
 *
 * Autocomplete KHÔNG đi qua đây.
 */

async function searchTomTom(
  query: string,
  signal?: AbortSignal,
  userLocation?: UserLocationBias | null,
): Promise<{
  ok: boolean;
  rateLimited: boolean;
  results: TomTomSearchApiResult[];
}> {
  try {
    const response = await fetch("/api/tomtom/search", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        lat: userLocation?.lat,
        lon: userLocation?.lon,

        /**
         * Cố tình KHÔNG gửi:
         *
         * entityTypeSet
         * limit
         *
         * để TomTom tự xử lý ranking.
         */
      }),
    });

    /**
     * TomTom hết quota / rate limit.
     */
    if (response.status === 429) {
      return {
        ok: false,
        rateLimited: true,
        results: [],
      };
    }

    /**
     * TomTom server error.
     */
    if (response.status >= 500) {
      return {
        ok: false,
        rateLimited: false,
        results: [],
      };
    }

    /**
     * Các lỗi khác.
     */
    if (!response.ok) {
      return {
        ok: false,
        rateLimited: false,
        results: [],
      };
    }

    const data = (await response.json()) as TomTomSearchProxyResponse;

    return {
      ok: true,
      rateLimited: false,
      results: data.results ?? [],
    };
  } catch {
    if (signal?.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }

    return {
      ok: false,
      rateLimited: false,
      results: [],
    };
  }
}

/**
 * ============================================================
 * TOMTOM ADMINISTRATIVE PRIORITY
 * ============================================================
 */

function getTomTomAdministrativePriority(entityType?: string): number {
  switch (entityType) {
    /**
     * Thành phố / đô thị.
     */
    case "Municipality":
      return 0;

    /**
     * Tỉnh / thành phố cấp tỉnh.
     */
    case "CountrySubdivision":
      return 0;

    /**
     * Quận / huyện.
     */
    case "MunicipalitySubdivision":
      return 1;

    /**
     * Phân khu nhỏ hơn.
     */
    case "MunicipalitySecondarySubdivision":
      return 2;

    /**
     * Đơn vị hành chính cấp dưới.
     */
    case "CountrySecondarySubdivision":
      return 2;

    case "CountryTertiarySubdivision":
      return 2;

    /**
     * Khu phố.
     */
    case "Neighbourhood":
      return 3;

    default:
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * ============================================================
 * TOMTOM RESULT -> PlaceResult
 * ============================================================
 */

function toTomTomPlaceResult(item: TomTomSearchApiResult): PlaceResult {
  return {
    id: `tomtom-${item.id}`,
    label:
      item.name && item.address
        ? `${item.name}, ${item.address}`
        : (item.name ?? item.address ?? "Không rõ địa chỉ"),
    lon: item.lon,
    lat: item.lat,
  };
}

/**
 * ============================================================
 * SORT TOMTOM
 * ============================================================
 */

function sortTomTomResults(
  items: TomTomSearchApiResult[],
  userLocation?: UserLocationBias | null,
): TomTomSearchApiResult[] {
  return items
    .map((item, index) => ({
      item,
      index,
      priority: getTomTomAdministrativePriority(item.entityType),
      distance: userLocation
        ? getDistance(item.lat, item.lon, userLocation)
        : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => {
      const aIsAdmin = Number.isFinite(a.priority);
      const bIsAdmin = Number.isFinite(b.priority);

      if (aIsAdmin && !bIsAdmin) {
        return -1;
      }

      if (!aIsAdmin && bIsAdmin) {
        return 1;
      }

      if (aIsAdmin && bIsAdmin) {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        if (userLocation) {
          return a.distance - b.distance;
        }

        return a.index - b.index;
      }

      if (userLocation) {
        return a.distance - b.distance;
      }

      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/**
 * ============================================================
 * MAIN SEARCH
 * ============================================================
 *
 * Search button:
 *
 *     TomTom
 *        ↓
 *     success
 *        ↓
 *     results
 *
 * TomTom lỗi / 429:
 *
 *     Nominatim
 */

export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  userLocation?: UserLocationBias | null,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();

  if (trimmed.length < 2) {
    return [];
  }

  /**
   * Search chính thức mới gọi TomTom.
   */

  const tomTomSearch = await searchTomTom(trimmed, signal, userLocation);

  /**
   * TomTom lỗi / 429 / network
   * -> Nominatim fallback.
   */

  if (!tomTomSearch.ok) {
    return searchWithNominatim(trimmed, signal, userLocation);
  }

  /**
   * TomTom hoạt động nhưng không có kết quả.
   *
   * Không cần gọi Nominatim lần nữa vì đây không phải
   * lỗi/quota.
   */

  if (tomTomSearch.results.length === 0) {
    return [];
  }

  /**
   * ----------------------------------------------------------
   * 4. SORT
   * ----------------------------------------------------------
   */

  const sortedResults = sortTomTomResults(tomTomSearch.results, userLocation);

  /**
   * ----------------------------------------------------------
   * 5. CONVERT
   * ----------------------------------------------------------
   */

  return sortedResults.map(toTomTomPlaceResult);
}

/**
 * ============================================================
 * REVERSE GEOCODING
 * ============================================================
 */

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  /**
   * Reverse geocoding cũng phải tôn trọng rate limit
   * của public Nominatim.
   */
  await waitForNominatimSlot(signal);

  const url = new URL("https://nominatim.openstreetmap.org/reverse");

  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "vi");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "MyGoMapApp/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as NominatimReverseResponse;

    return data.display_name ?? null;
  } catch {
    if (signal?.aborted) {
      throw new DOMException("Reverse geocoding aborted", "AbortError");
    }

    return null;
  }
}
