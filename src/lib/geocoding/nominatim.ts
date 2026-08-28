// import { NOMINATIM_SEARCH_URL } from "../constants";
import type { PlaceResult } from "../types";
import type { TomTomSearchApiResult } from "@/app/api/tomtom/search/route";

export type UserLocationBias = {
  lat: number;
  lon: number;
};

interface TomTomSearchProxyResponse {
  results?: TomTomSearchApiResult[];
  error?: string;
}

/**
 * Searches for places by free-text query using TomTom's Search API (qua proxy
 * server /api/tomtom/search) thay vì Nominatim/OSM như trước — dữ liệu POI/địa
 * điểm của TomTom là cơ sở dữ liệu RIÊNG của họ, không phụ thuộc vào việc OSM
 * đã có ai vẽ/tag địa điểm đó chưa, nên khắc phục được tình trạng "địa điểm có
 * thật ngoài đời nhưng tìm không ra" do dữ liệu OSM thiếu/cũ.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  userLocation?: UserLocationBias | null,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  /**
   * Tìm địa danh hành chính trước.
   *
   * Điều này rất quan trọng với các query như:
   * - Đà Lạt
   * - Hà Nội
   * - Đà Nẵng
   * - Quận 1
   * - Phường Bến Nghé
   * - Thủ Đức
   *
   * Nếu không làm bước này, TomTom có thể trả về:
   * "Cafe Đà Lạt", "Nhà hàng Đà Lạt"... gần user
   * trước "Thành phố Đà Lạt".
   */
  const administrativeResponse = await fetch("/api/tomtom/search", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: trimmed,
      lat: userLocation?.lat,
      lon: userLocation?.lon,

      // Chỉ lấy các thực thể địa lý/hành chính.
      entityTypeSet:
        "CountrySubdivision,CountrySecondarySubdivision,CountryTertiarySubdivision,Municipality,MunicipalitySubdivision,MunicipalitySecondarySubdivision,Neighbourhood",

      // limit: 10,
    }),
  });

  let administrativeResults: TomTomSearchApiResult[] = [];

  if (administrativeResponse.ok) {
    const data =
      (await administrativeResponse.json()) as TomTomSearchProxyResponse;

    administrativeResults = data.results ?? [];
  }

  /**
   * Vẫn tìm search bình thường để không làm mất:
   * - quán cafe
   * - nhà hàng
   * - khách sạn
   * - địa chỉ cụ thể
   * - POI
   * - đường
   *
   * Nhưng các kết quả hành chính phù hợp sẽ được ưu tiên ở phía trên.
   */
  const response = await fetch("/api/tomtom/search", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: trimmed,
      lat: userLocation?.lat,
      lon: userLocation?.lon,
      // limit: 10,
    }),
  });

  if (!response.ok) return [];

  const data = (await response.json()) as TomTomSearchProxyResponse;

  const normalResults = data.results ?? [];

  /**
   * ID của các kết quả hành chính.
   * Dùng để loại duplicate khi merge với search bình thường.
   */
  const administrativeIds = new Set(
    administrativeResults.map((item) => item.id),
  );

  /**
   * Kết quả hành chính:
   * - Municipality = thành phố/thị xã/thị trấn
   * - MunicipalitySubdivision = khu vực/phường/xã thuộc đô thị
   * - CountrySubdivision = tỉnh/thành phố cấp tỉnh
   * - Neighbourhood = khu phố/khu vực
   */
  const prioritizedAdministrativeResults = administrativeResults.map(
    (item) => ({
      ...item,
      isAdministrative: true,
    }),
  );

  /**
   * Kết quả search bình thường nhưng loại bỏ những item đã xuất hiện
   * trong danh sách hành chính.
   */
  const otherResults = normalResults
    .filter((item) => !administrativeIds.has(item.id))
    .map((item) => ({
      ...item,
      isAdministrative: false,
    }));

  const mergedResults = [...prioritizedAdministrativeResults, ...otherResults];

  const toRadians = (value: number) => (value * Math.PI) / 180;

  const getDistance = (lat: number, lon: number) => {
    if (!userLocation) return Number.POSITIVE_INFINITY;

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
  };

  /**
   * QUAN TRỌNG:
   *
   * Không sort tất cả kết quả theo khoảng cách nữa.
   *
   * Thứ tự ưu tiên:
   *
   * 1. Địa danh hành chính
   * 2. Các kết quả search bình thường gần user
   *
   * Như vậy:
   *
   * "Đà Lạt"
   *   -> Thành phố Đà Lạt
   *   -> Cafe Đà Lạt ở TP.HCM
   *
   * thay vì:
   *
   * Cafe Đà Lạt ở TP.HCM
   *   -> Thành phố Đà Lạt
   */
  const sortedResults = [
    ...mergedResults
      .filter((item) => item.isAdministrative)
      .map((item) => ({
        item,
        distance: getDistance(item.lat, item.lon),
      }))
      .sort((a, b) => {
        /**
         * Với các địa danh hành chính, ưu tiên độ chính xác của
         * kết quả TomTom hơn khoảng cách tới user.
         *
         * Nếu cùng loại thì mới xét khoảng cách.
         */
        const aEntity = a.item.entityType ?? "";
        const bEntity = b.item.entityType ?? "";

        const administrativePriority = (entityType: string) => {
          switch (entityType) {
            case "Municipality":
              return 0;

            case "CountrySubdivision":
              return 1;

            case "MunicipalitySubdivision":
              return 2;

            case "MunicipalitySecondarySubdivision":
              return 3;

            case "CountrySecondarySubdivision":
              return 4;

            case "CountryTertiarySubdivision":
              return 5;

            case "Neighbourhood":
              return 6;

            default:
              return 10;
          }
        };

        const priorityDiff =
          administrativePriority(aEntity) - administrativePriority(bEntity);

        if (priorityDiff !== 0) return priorityDiff;

        return a.distance - b.distance;
      }),

    ...mergedResults
      .filter((item) => !item.isAdministrative)
      .map((item) => ({
        item,
        distance: getDistance(item.lat, item.lon),
      }))
      .sort((a, b) => a.distance - b.distance),
  ];

  return sortedResults.map(({ item }) => ({
    id: item.id,
    label:
      item.name && item.address
        ? `${item.name}, ${item.address}`
        : (item.name ?? item.address ?? "Không rõ địa chỉ"),
    lon: item.lon,
    lat: item.lat,
  }));
}

interface NominatimReverseResponse {
  display_name?: string;
}

/**
 * Looks up a human-readable address for a single coordinate. Used ONLY
 * on-demand (e.g. when the user opens a stop's detail drawer and a POI has
 * no address from its OSM tags) rather than for every POI up front — Nominatim's
 * free tier asks for at most ~1 request/second and no bulk use, so this must
 * stay a rare, user-triggered lookup, not something called for dozens of POIs
 * at once. Callers are responsible for spacing out repeated calls.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "json");
  url.searchParams.set("accept-language", "vi");

  try {
    const response = await fetch(url.toString(), {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const data = (await response.json()) as NominatimReverseResponse;
    return data.display_name ?? null;
  } catch {
    // Network hiccup or aborted — the caller just keeps showing "no address"
    // rather than surfacing an error for a non-critical enhancement.
    return null;
  }
}
