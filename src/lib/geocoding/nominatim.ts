import type { PlaceResult } from "../types";
import type { TomTomSearchApiResult } from "@/app/api/tomtom/search/route";

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
 * CONSTANTS
 * ============================================================
 */

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";

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
 * ADMINISTRATIVE PRIORITY - NOMINATIM
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
   * ----------------------------------------------------------
   * 1. TỈNH / THÀNH PHỐ
   * ----------------------------------------------------------
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
   * ----------------------------------------------------------
   * 2. QUẬN / HUYỆN / THỊ XÃ
   * ----------------------------------------------------------
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
   * ----------------------------------------------------------
   * 3. PHƯỜNG / XÃ / THỊ TRẤN
   * ----------------------------------------------------------
   *
   * Nominatim có thể trả:
   * - suburb
   * - village
   * - town
   * - administrative
   * tùy dữ liệu OSM.
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
   * ----------------------------------------------------------
   * 4. KHU PHỐ / NEIGHBOURHOOD
   * ----------------------------------------------------------
   */

  if (type === "neighbourhood" || type === "residential") {
    return 3;
  }

  /**
   * ----------------------------------------------------------
   * 5. ADMINISTRATIVE GENERIC
   * ----------------------------------------------------------
   *
   * Một số địa danh Việt Nam được Nominatim trả về là
   * class=boundary + type=administrative nhưng không có
   * type cụ thể.
   */

  if (itemClass === "boundary" && type === "administrative") {
    return 1;
  }

  return Number.POSITIVE_INFINITY;
}

function isNominatimAdministrative(item: NominatimItem): boolean {
  return getNominatimAdministrativePriority(item) !== Number.POSITIVE_INFINITY;
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
 * SORT NOMINATIM RESULTS
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
 * - autocomplete khi người dùng đang nhập
 * - fallback khi TomTom hết quota / lỗi
 *
 * QUAN TRỌNG:
 *
 * - Không gọi TomTom.
 * - Không dùng debounce bên trong service.
 * - Component tự debounce 400ms.
 * - Không slice kết quả.
 *
 * Nominatim vẫn có giới hạn thực tế của public service/API,
 * nhưng phía application KHÔNG tự cắt danh sách kết quả.
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

  const url = new URL(NOMINATIM_SEARCH_URL);

  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "vn");
  url.searchParams.set("accept-language", "vi");

  /**
   * Không set limit.
   *
   * Frontend cũng không slice kết quả.
   */
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "MyGoMapApp/1.0",
      },
    });
  } catch {
    if (signal?.aborted) {
      throw new DOMException("Search aborted", "AbortError");
    }

    return [];
  }

  if (!response.ok) {
    return [];
  }

  let items: NominatimItem[];

  try {
    items = (await response.json()) as NominatimItem[];
  } catch {
    return [];
  }

  /**
   * Loại bỏ các tọa độ không hợp lệ.
   */
  const validItems = items.filter((item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon);

    return Number.isFinite(lat) && Number.isFinite(lon);
  });

  const sortedItems = sortNominatimResults(validItems, userLocation);

  return sortedItems.map(toNominatimPlaceResult);
}

/**
 * ============================================================
 * TOMTOM REQUEST
 * ============================================================
 *
 * CHỈ gọi khi:
 *
 * - người dùng bấm Search
 * - hoặc Enter
 *
 * KHÔNG được gọi trong autocomplete.
 *
 * Chỉ 1 request TomTom.
 *
 * Nếu:
 * - 429
 * - 5xx
 * - network error
 *
 * => searchPlaces() fallback Nominatim.
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

function isTomTomAdministrative(item: TomTomSearchApiResult): boolean {
  return (
    getTomTomAdministrativePriority(item.entityType) !==
    Number.POSITIVE_INFINITY
  );
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
 * SORT TOMTOM RESULTS
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
 * Đây là SEARCH CHÍNH khi:
 *
 *      [ Search ]
 *          ↓
 *      TomTom
 *          ↓
 *       thành công
 *          ↓
 *      trả kết quả
 *
 * Nếu TomTom:
 *
 *      429 / 5xx / network
 *          ↓
 *      Nominatim
 *
 * QUAN TRỌNG:
 *
 * searchPlaces() KHÔNG được dùng cho autocomplete.
 *
 * Autocomplete phải gọi trực tiếp searchWithNominatim().
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
   * ----------------------------------------------------------
   * 1. TOMTOM
   * ----------------------------------------------------------
   */

  const tomTomSearch = await searchTomTom(trimmed, signal, userLocation);

  /**
   * ----------------------------------------------------------
   * 2. TOMTOM FAIL -> NOMINATIM
   * ----------------------------------------------------------
   */

  if (!tomTomSearch.ok) {
    return searchWithNominatim(trimmed, signal, userLocation);
  }

  /**
   * ----------------------------------------------------------
   * 3. TOMTOM KHÔNG CÓ RESULT
   * ----------------------------------------------------------
   *
   * Không coi empty result là hết quota.
   *
   * TomTom hoạt động bình thường nhưng không tìm thấy
   * => trả [].
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
 *
 * Vẫn dùng Nominatim.
 *
 * Không liên quan TomTom Search quota.
 */

export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");

  url.searchParams.set("lat", String(lat));

  url.searchParams.set("lon", String(lon));

  url.searchParams.set("format", "jsonv2");

  url.searchParams.set("accept-language", "vi");

  try {
    const response = await fetch(url.toString(), {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "MyGoMapApp/1.0",
      },
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
