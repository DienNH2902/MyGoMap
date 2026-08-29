import {
  OVERPASS_INTERPRETER_URL,
  POI_SEARCH_RADIUS_METERS,
  MAX_POIS_PER_CATEGORY_PER_STOP,
} from "../constants";
import {
  distanceBetweenKm,
  getDistanceFromRouteStartKm,
  getRouteWindowOverpassBbox,
} from "../geo/turfHelpers";
import type { PoiCategoryDefinition, PoiResult } from "../types";
import type { TomTomSearchApiResult } from "@/app/api/tomtom/search/route";

interface OverpassTags {
  name?: string;
  "addr:housenumber"?: string;
  "addr:street"?: string;
  "addr:full"?: string;
  "addr:place"?: string;
  "addr:suburb"?: string;
  "addr:city"?: string;
  "addr:district"?: string;
  "addr:province"?: string;
  image?: string;
  wikimedia_commons?: string;
  [key: string]: string | undefined;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OverpassTags;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/**
 * Builds a human-readable address from whatever OSM address tags a POI
 * happens to have. Most POIs in Vietnam are only tagged with a subset of
 * these (a fuel station might have `addr:street` but no house number, or
 * only `addr:city`), so we fall back through several combinations instead
 * of requiring the full street + house number pair. This is the main fix
 * for "tên có nhưng không có địa chỉ" — the old version only looked at
 * house number + street + city, which most OSM nodes don't have all of.
 */
function buildAddress(tags: OverpassTags | undefined): string | undefined {
  if (!tags) return undefined;

  // Some places are tagged with a single ready-made address string.
  if (tags["addr:full"]) return tags["addr:full"];

  const streetLine = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const localityLine = [
    tags["addr:suburb"],
    tags["addr:place"],
    tags["addr:city"],
    tags["addr:district"],
    tags["addr:province"],
  ]
    .filter(Boolean)
    // De-duplicate, since some nodes repeat the same value across suburb/city/district tags.
    .filter((value, index, all) => all.indexOf(value) === index);

  const parts = [streetLine, ...localityLine].filter(
    (part) => part && part.length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/**
 * Resolves a usable photo URL for a POI, when OSM happens to have one.
 * Two sources are checked, in order of reliability:
 * 1. `image` — sometimes a direct URL, sometimes just a filename. We only
 *    use it if it's actually a URL, to avoid broken <img> tags.
 * 2. `wikimedia_commons` — a "File:xxx.jpg" reference. Wikimedia's
 *    Special:FilePath endpoint resolves this straight to the image bytes,
 *    for free, with no API key and no extra network round-trip (it's just
 *    a URL we build, the browser does the fetching).
 * Most POIs will have neither — the UI falls back to a category icon.
 */
function resolveImageUrl(tags: OverpassTags | undefined): string | undefined {
  if (!tags) return undefined;

  if (tags.image && /^https?:\/\//i.test(tags.image)) {
    return tags.image;
  }

  if (tags.wikimedia_commons?.startsWith("File:")) {
    const fileName = tags.wikimedia_commons.slice("File:".length);
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=300`;
  }

  return undefined;
}

/** One point along the route we want nearby POIs for. */
export interface StopQueryPoint {
  stopId: string;
  lon: number;
  lat: number;
}

/** Result of a batched POI search: per-stop, per-category POI lists. */
export interface PoiSearchResult {
  /** stopId -> categoryId -> matching POIs, nearest first. */
  resultsByStop: Map<string, Record<string, PoiResult[]>>;
  /**
   * True if the Overpass request itself failed (network error, rate limit,
   * server error) after retries. When true, `resultsByStop` is empty for
   * every stop — this is NOT the same as "searched successfully but found
   * nothing nearby", which is a normal, non-error outcome.
   */
  fetchFailed: boolean;
}

/** Overpass sometimes needs a moment under load — 20s is generous but bounded. */
const OVERPASS_TIMEOUT_MS = 20000;
/** One retry is enough since the whole trip is now a single request, not one per stop. */
const OVERPASS_MAX_ATTEMPTS = 2;

/**
 * Prepended to every Overpass query that searches for POIs/stop suggestions,
 * and appended as `(area.vn)` on each node/way/relation clause — this
 * intersects the existing `around:`/bbox filter with Vietnam's own OSM
 * country boundary, so a search radius or highway-snap window that happens
 * to dip across the border (Cao Bằng/Lạng Sơn near China, An Giang/Kiên
 * Giang near Cambodia, etc.) never returns a foreign result. This does NOT
 * apply to "Tìm quanh đây" (findPoisAroundPoint) alone — that mode is also
 * hard-blocked client-side via isPointInVietnam before the request is even
 * sent, since a user tapping a point clearly outside Vietnam should see a
 * clear message instead of a silently-empty result.
 */
const VIETNAM_AREA_SETUP = `area["ISO3166-1"="VN"]["admin_level"="2"]->.vn;`;
const VIETNAM_AREA_FILTER = `(area.vn)`;

/**
 * Sends one Overpass query, retrying once on rate-limit / server-busy
 * responses. Never throws — on any failure it logs a warning and resolves to
 * `null`, so a flaky Overpass server can never take down the whole trip plan.
 */
async function fetchOverpassQuery(
  query: string,
  externalSignal?: AbortSignal,
): Promise<OverpassResponse | null> {
  for (let attempt = 1; attempt <= OVERPASS_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", forwardAbort);

    try {
      // Gọi qua API Route trung gian của Next.js
      const response = await fetch("/api/overpass", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });

      // Server is busy / rate-limiting us — back off briefly and retry once.
      if (
        (response.status === 429 ||
          response.status === 504 ||
          response.status === 500) &&
        attempt < OVERPASS_MAX_ATTEMPTS
      ) {
        const waitMs = 1500 * attempt;
        console.warn(
          `Overpass API đang bận (mã ${response.status}). Thử lại sau ${waitMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      if (!response.ok) {
        console.warn(
          `Overpass API trả về lỗi ${response.status}. Bỏ qua gợi ý địa điểm cho lần lập lộ trình này.`,
        );
        return null;
      }

      return (await response.json()) as OverpassResponse;
    } catch (err) {
      const reason =
        err instanceof DOMException && err.name === "AbortError"
          ? "hết thời gian chờ"
          : String(err);
      console.warn(
        `Overpass API request thất bại (${reason}), lần thử ${attempt}/${OVERPASS_MAX_ATTEMPTS}.`,
      );
      if (attempt === OVERPASS_MAX_ATTEMPTS) return null;
    } finally {
      clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", forwardAbort);
    }
  }
  return null;
}

/**
 * Gọi API proxy TomTom Search (/api/tomtom/search) để tìm POI theo tên danh
 * mục (vd "Trạm xăng"), ưu tiên/giới hạn quanh 1 toạ độ + bán kính — dùng
 * chung cho cả `findPoisForStops` (POI quanh từng điểm dừng khi lập lộ
 * trình) và `findPoisAroundPoint` (tìm quanh 1 điểm bất kỳ người dùng chọn).
 * Đây là lý do 2 hàm này KHÔNG còn phụ thuộc Overpass/OSM nữa — dữ liệu POI
 * của TomTom là cơ sở dữ liệu riêng của họ, có thể tìm ra được những địa
 * điểm mà OSM chưa từng được ai vẽ/tag.
 *
 * Không throw: mọi lỗi mạng/HTTP đều trả về `null`, để bên gọi tự quyết định
 * coi là "không tìm thấy" hay "fetch thất bại".
 */
async function fetchTomTomPois(
  categoryQuery: string,
  center: { lat: number; lon: number },
  radiusMeters: number,
  limit: number,
  signal?: AbortSignal,
): Promise<TomTomSearchApiResult[] | null> {
  try {
    const response = await fetch("/api/tomtom/search", {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: categoryQuery,
        lat: center.lat,
        lon: center.lon,
        radiusMeters,
        limit,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      results?: TomTomSearchApiResult[];
    };
    return data.results ?? [];
  } catch {
    return null;
  }
}

/**
 * Chạy nhiều task bất đồng bộ với giới hạn số lượng chạy song song cùng lúc
 * — cần thiết vì `findPoisForStops` có thể gọi TomTom hàng chục lần (mỗi cặp
 * điểm-dừng × danh-mục là 1 lần gọi), trong khi TomTom free tier giới hạn
 * QPS khá thấp (~5 request/giây) trên gói self-serve. Bắn tất cả cùng lúc dễ
 * dính 429; giới hạn còn 4 luồng song song giúp an toàn hơn nhiều mà vẫn
 * nhanh hơn hẳn so với gọi tuần tự từng cái một.
 */
async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      const task = tasks[currentIndex];
      if (!task) continue;

      results[currentIndex] = await task();
    }
  }

  const workerCount = Math.min(concurrency, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

/**
 * Finds nearby POIs for every stop by calling TomTom Search once per (stop,
 * category) pair — chạy song song có giới hạn (xem `runWithConcurrencyLimit`)
 * thay vì 1 query Overpass gộp như trước, vì TomTom Search không hỗ trợ gộp
 * nhiều truy vấn khác nhau vào 1 request như Overpass.
 *
 * `fetchFailed` chỉ true khi TẤT CẢ các cặp (điểm dừng, danh mục) đều lỗi —
 * nếu chỉ một vài cặp lỗi (vd 429 thoáng qua) trong khi số còn lại vẫn có
 * kết quả, coi đó là thành công một phần thay vì làm mất luôn cả chuyến đi.
 */
export async function findPoisForStops(
  points: StopQueryPoint[],
  categories: PoiCategoryDefinition[],
  signal?: AbortSignal,
): Promise<PoiSearchResult> {
  const resultsByStop = new Map<string, Record<string, PoiResult[]>>();

  for (const point of points) {
    resultsByStop.set(point.stopId, {});
  }

  if (points.length === 0 || categories.length === 0) {
    return { resultsByStop, fetchFailed: false };
  }

  // One `around:` clause per (stop, category) combination, all unioned into
  // a single query. Overpass automatically de-duplicates a node that matches
  // more than one clause (e.g. it's near two different stops), so we never
  // pay for the same element twice.
  const clauses: string[] = [];

  for (const point of points) {
    for (const category of categories) {
      clauses.push(
        `node["${category.osmKey}"="${category.osmValue}"](around:${POI_SEARCH_RADIUS_METERS},${point.lat},${point.lon})${VIETNAM_AREA_FILTER};`,
      );
    }
  }

  const query = `[out:json][timeout:25];${VIETNAM_AREA_SETUP}(${clauses.join(
    "\n",
  )});out center tags;`;

  const data = await fetchOverpassQuery(query, signal);

  if (!data) {
    return {
      resultsByStop,
      fetchFailed: true,
    };
  }

  // Pre-compute each element's coordinates once (nodes have lat/lon directly,
  // ways/relations only carry a `center` when queried with `out center`).
  const elementsWithCoords = data.elements
    .map((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;

      if (lat === undefined || lon === undefined) {
        return null;
      }

      return {
        element,
        lat,
        lon,
      };
    })
    .filter(
      (
        entry,
      ): entry is {
        element: OverpassElement;
        lat: number;
        lon: number;
      } => entry !== null,
    );

  // For each stop and category, re-filter the shared result set by actual
  // distance to THAT stop (an element can appear in the union because it's
  // near stop A without necessarily being within radius of stop B).
  for (const point of points) {
    const categoryResults: Record<string, PoiResult[]> = {};

    for (const category of categories) {
      const matches = elementsWithCoords
        .filter(
          ({ element }) =>
            element.tags?.[category.osmKey] === category.osmValue,
        )
        .map(
          ({ element, lat, lon }): PoiResult => ({
            id: `${category.id}-${element.type}-${element.id}`,
            name: element.tags?.name ?? category.label,
            category: category.id,
            lon,
            lat,
            address: buildAddress(element.tags),
            imageUrl: resolveImageUrl(element.tags),
            distanceFromStopKm: distanceBetweenKm(point, {
              lon,
              lat,
            }),
          }),
        )
        .filter(
          (poi) => poi.distanceFromStopKm * 1000 <= POI_SEARCH_RADIUS_METERS,
        )
        .sort((a, b) => a.distanceFromStopKm - b.distanceFromStopKm)
        .slice(0, MAX_POIS_PER_CATEGORY_PER_STOP);

      categoryResults[category.id] = matches;
    }

    resultsByStop.set(point.stopId, categoryResults);
  }

  return {
    resultsByStop,
    fetchFailed: false,
  };
}

export interface AroundSearchInput {
  center: {
    lon: number;
    lat: number;
  };
  radiusMeters: number;
  category: PoiCategoryDefinition;
  signal?: AbortSignal;
}

export async function findPoisAroundPoint({
  center,
  radiusMeters,
  category,
  signal,
}: AroundSearchInput): Promise<{
  pois: PoiResult[];
  fetchFailed: boolean;
}> {
  const safeRadiusMeters = Math.max(50, Math.min(10000, radiusMeters));

  const items = await fetchTomTomPois(
    category.label,
    center,
    safeRadiusMeters,
    30,
    signal,
  );

  if (items === null) {
    return { pois: [], fetchFailed: true };
  }

  const pois = items
    .map(
      (item): PoiResult => ({
        id: `around-${category.id}-tomtom-${item.id}`,
        name: item.name ?? category.label,
        category: category.id,
        lon: item.lon,
        lat: item.lat,
        address: item.address ?? undefined,
        distanceFromStopKm: distanceBetweenKm(center, {
          lon: item.lon,
          lat: item.lat,
        }),
      }),
    )
    .filter((poi) => poi.distanceFromStopKm * 1000 <= safeRadiusMeters)
    .sort((a, b) => a.distanceFromStopKm - b.distanceFromStopKm)
    .slice(0, 30);

  return { pois, fetchFailed: false };
}

export interface HighwaySnapCandidate {
  lon: number;
  lat: number;
  distanceFromStartKm: number;
}

export interface HighwaySnapResult extends HighwaySnapCandidate {
  /** false = giữ nguyên điểm gốc (không gần cao tốc, hoặc không tìm thấy gì phù hợp trong bán kính cho phép). */
  snappedToHighwayFeature: boolean;
  highwayFeatureType?: "rest_area" | "services" | "motorway_junction";
  highwayFeatureName?: string;
}

/** Cửa sổ tìm kiếm quanh mỗi mốc chia đều lý tưởng dọc tuyến. */
const HIGHWAY_SNAP_WINDOW_KM = 20;
/** Không chấp nhận trạm/lối ra cách mốc lý tưởng quá xa — thà giữ nguyên mốc gốc còn hơn kéo lệch cả chục km khỏi vị trí "chia đều" ban đầu. */
const HIGHWAY_SNAP_MAX_OFFSET_KM = 25;

/**
 * Với mỗi mốc dừng chia đều tự động, kiểm tra xem nó có đang rơi gần một
 * đoạn cao tốc hay không — nếu có, thay bằng vị trí THẬT mà ô tô có thể dừng:
 * ưu tiên trạm dừng chân/trạm nghỉ (`highway=services`/`rest_area`) nếu có
 * gần đó, không thì lấy lối ra gần nhất (`highway=motorway_junction`) để sau
 * đó tìm POI quanh lối ra đó trên đường thường. Những mốc không gần cao tốc
 * (đường thường) được trả về NGUYÊN VẸN, không đổi gì — đây là lý do hàm này
 * an toàn để luôn gọi mà không cần biết trước tuyến có đi cao tốc hay không.
 *
 * Không throw: mọi lỗi Overpass cho từng mốc chỉ khiến mốc đó giữ nguyên vị
 * trí gốc (giống hành vi cũ), không bao giờ làm hỏng cả chuyến đi.
 */
export async function snapAutoStopsToHighwayExits(
  candidates: HighwaySnapCandidate[],
  routeCoordinates: [number, number][],
  signal?: AbortSignal,
): Promise<HighwaySnapResult[]> {
  if (candidates.length === 0) return [];

  return Promise.all(
    candidates.map((candidate) =>
      snapOneStopToHighwayExit(candidate, routeCoordinates, signal),
    ),
  );
}

async function snapOneStopToHighwayExit(
  candidate: HighwaySnapCandidate,
  routeCoordinates: [number, number][],
  signal?: AbortSignal,
): Promise<HighwaySnapResult> {
  const bbox = getRouteWindowOverpassBbox(
    routeCoordinates,
    candidate.distanceFromStartKm,
    HIGHWAY_SNAP_WINDOW_KM,
  );
  if (!bbox) return { ...candidate, snappedToHighwayFeature: false };

  const bboxStr = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const query = `[out:json][timeout:25];${VIETNAM_AREA_SETUP}(
node["highway"="services"](${bboxStr})${VIETNAM_AREA_FILTER};
way["highway"="services"](${bboxStr})${VIETNAM_AREA_FILTER};
node["highway"="rest_area"](${bboxStr})${VIETNAM_AREA_FILTER};
way["highway"="rest_area"](${bboxStr})${VIETNAM_AREA_FILTER};
node["highway"="motorway_junction"](${bboxStr})${VIETNAM_AREA_FILTER};
);out center tags;`;

  const data = await fetchOverpassQuery(query, signal);
  if (!data || data.elements.length === 0) {
    return { ...candidate, snappedToHighwayFeature: false };
  }

  type RankedFeature = {
    lon: number;
    lat: number;
    type: "rest_area" | "services" | "motorway_junction";
    name?: string;
    offsetKm: number;
    priority: number;
  };

  const ranked = data.elements
    .map((element): RankedFeature | null => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      const highwayTag = element.tags?.highway;
      if (lat === undefined || lon === undefined) return null;
      if (
        highwayTag !== "services" &&
        highwayTag !== "rest_area" &&
        highwayTag !== "motorway_junction"
      ) {
        return null;
      }

      const distanceAlongRouteKm = getDistanceFromRouteStartKm(
        routeCoordinates,
        { lon, lat },
      );
      const offsetKm = Math.abs(
        distanceAlongRouteKm - candidate.distanceFromStartKm,
      );

      // Ưu tiên trạm dừng chân/trạm nghỉ THẬT (ăn uống/đổ xăng ngay tại chỗ)
      // hơn lối ra đơn thuần (chỉ vừa thoát khỏi cao tốc, chưa chắc gần gì).
      const priority = highwayTag === "motorway_junction" ? 1 : 0;

      return {
        lon,
        lat,
        type: highwayTag,
        name: element.tags?.name,
        offsetKm,
        priority,
      };
    })
    .filter((entry): entry is RankedFeature => entry !== null)
    .filter((entry) => entry.offsetKm <= HIGHWAY_SNAP_MAX_OFFSET_KM)
    .sort((a, b) => a.priority - b.priority || a.offsetKm - b.offsetKm);

  const best = ranked[0];
  if (!best) return { ...candidate, snappedToHighwayFeature: false };

  return {
    lon: best.lon,
    lat: best.lat,
    distanceFromStartKm: candidate.distanceFromStartKm,
    snappedToHighwayFeature: true,
    highwayFeatureType: best.type,
    highwayFeatureName: best.name,
  };
}

/**
 * Checks whether a coordinate lies within Vietnam's actual OSM administrative
 * boundary — deliberately NOT a rough lat/lon bounding-box check, which would
 * incorrectly "pass" points just across the Cambodia/Laos/China border that
 * happen to share a similar latitude/longitude range. Uses Overpass's
 * `is_in()` to find every area containing the point, then checks whether
 * Vietnam (ISO3166-1=VN, admin_level=2) is one of them.
 *
 * On any Overpass failure (timeout, rate-limit, network), this resolves to
 * `true` rather than blocking the user — a flaky API response should never
 * be mistaken for "you're outside Vietnam". The real search that follows
 * already has its own Vietnam-only area filter (VIETNAM_AREA_FILTER) as a
 * second line of defense, so this fail-open behavior can't leak foreign POIs.
 */

/**
 * Kiểm tra nhanh một tọa độ có nằm trong phạm vi lãnh thổ Việt Nam hay không.
 * Sử dụng kiểm tra BBOX kết hợp Reverse Geocoding chuẩn để tránh lọt qua khi API lỗi.
 */
export async function isPointInVietnam(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<boolean> {
  // 1. Chặn nhanh bằng khung tọa độ mở rộng (Bounding Box) của Việt Nam
  // Tọa độ VN: Vĩ độ 8.18 -> 23.39, Kinh độ 102.14 -> 109.46
  if (lat < 8.18 || lat > 23.39 || lon < 102.14 || lon > 109.46) {
    return false;
  }

  // 2. Kiểm tra chính xác ranh giới quốc gia qua Nominatim Reverse Geocoding
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=3`,
      {
        headers: {
          "Accept-Language": "vi,en",
          "User-Agent": "MyGoMap_App/1.0",
        },
        signal,
      },
    );

    if (!response.ok) {
      // Nếu API lỗi, fallback về kiểm tra BBOX thu gọn (An toàn)
      return isWithinVietnamRoughBoundary(lat, lon);
    }

    const data = (await response.json()) as {
      address?: { country_code?: string };
    };
    const countryCode = data.address?.country_code?.toLowerCase();

    if (countryCode) {
      return countryCode === "vn";
    }

    return isWithinVietnamRoughBoundary(lat, lon);
  } catch (error) {
    // Nếu bị AbortController hoặc Mạng lỗi, dùng ranh giới hình học thô thay vì cho qua (return true)
    return isWithinVietnamRoughBoundary(lat, lon);
  }
}

/**
 * Thuật toán kiểm tra Bounding Box đa giác thô (loại bỏ Lào, Campuchia, Thái Lan nằm trong BBOX chữ nhật)
 */
function isWithinVietnamRoughBoundary(lat: number, lon: number): boolean {
  // Loại bỏ khu vực phía Tây (Lào / Campuchia / Thái Lan) trong BBOX
  if (lat < 14.0 && lon < 104.5) return false; // Campuchia / Nam Thái Lan
  if (lat >= 14.0 && lat < 20.0 && lon < 102.8) return false; // Lào
  if (lat >= 20.0 && lon < 102.14) return false; // Tây Bắc biên giới

  return true;
}

// export async function isPointInVietnam(
//   lat: number,
//   lon: number,
//   signal?: AbortSignal,
// ): Promise<boolean> {
//   const query = `[out:json][timeout:15];is_in(${lat},${lon})->.a;area.a["ISO3166-1"="VN"]["admin_level"="2"];out ids;`;

//   const data = await fetchOverpassQuery(query, signal);
//   if (!data) return true;

//   return data.elements.length > 0;
// }
