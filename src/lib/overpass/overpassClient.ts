import { OVERPASS_INTERPRETER_URL, POI_SEARCH_RADIUS_METERS, MAX_POIS_PER_CATEGORY_PER_STOP } from '../constants';
import { distanceBetweenKm } from '../geo/turfHelpers';
import type { PoiCategoryDefinition, PoiResult } from '../types';

interface OverpassTags {
  name?: string;
  'addr:housenumber'?: string;
  'addr:street'?: string;
  'addr:full'?: string;
  'addr:place'?: string;
  'addr:suburb'?: string;
  'addr:city'?: string;
  'addr:district'?: string;
  'addr:province'?: string;
  image?: string;
  wikimedia_commons?: string;
  [key: string]: string | undefined;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
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
  if (tags['addr:full']) return tags['addr:full'];

  const streetLine = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const localityLine = [tags['addr:suburb'], tags['addr:place'], tags['addr:city'], tags['addr:district'], tags['addr:province']]
    .filter(Boolean)
    // De-duplicate, since some nodes repeat the same value across suburb/city/district tags.
    .filter((value, index, all) => all.indexOf(value) === index);

  const parts = [streetLine, ...localityLine].filter((part) => part && part.length > 0);
  return parts.length > 0 ? parts.join(', ') : undefined;
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

  if (tags.wikimedia_commons?.startsWith('File:')) {
    const fileName = tags.wikimedia_commons.slice('File:'.length);
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
 * Finds nearby POIs for ALL stops in ONE Overpass request instead of one
 * request per stop. This is the key fix for the "trạm thứ 3 bị treo rồi báo
 * lỗi 429" bug: querying stops one at a time meant every extra stop added
 * another sequential HTTP round-trip (plus retry backoff), which very
 * quickly ran into Overpass's public rate limit. A single combined query —
 * one `around:` clause per (stop, category) pair, unioned together — asks
 * for everything at once and lets Overpass's server do the heavy lifting in
 * one pass, which is both faster and far less likely to be rate-limited.
 *
 * Never throws: any failure degrades to "no POIs found" for every stop
 * (see `fetchFailed`) so the route itself is never lost because of this.
 */
export async function findPoisForStops(
  points: StopQueryPoint[],
  categories: PoiCategoryDefinition[],
  signal?: AbortSignal
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
        `node["${category.osmKey}"="${category.osmValue}"](around:${POI_SEARCH_RADIUS_METERS},${point.lat},${point.lon});`
      );
    }
  }

  const query = `[out:json][timeout:25];(${clauses.join('\n')});out center tags;`;

  const data = await fetchOverpassQuery(query, signal);
  if (!data) {
    return { resultsByStop, fetchFailed: true };
  }

  // Pre-compute each element's coordinates once (nodes have lat/lon directly,
  // ways/relations only carry a `center` when queried with `out center`).
  const elementsWithCoords = data.elements
    .map((element) => {
      const lat = element.lat ?? element.center?.lat;
      const lon = element.lon ?? element.center?.lon;
      if (lat === undefined || lon === undefined) return null;
      return { element, lat, lon };
    })
    .filter((entry): entry is { element: OverpassElement; lat: number; lon: number } => entry !== null);

  // For each stop and category, re-filter the shared result set by actual
  // distance to THAT stop (an element can appear in the union because it's
  // near stop A without necessarily being within radius of stop B).
  for (const point of points) {
    const categoryResults: Record<string, PoiResult[]> = {};

    for (const category of categories) {
      const matches = elementsWithCoords
        .filter(({ element }) => element.tags?.[category.osmKey] === category.osmValue)
        .map(({ element, lat, lon }): PoiResult => ({
          id: `${category.id}-${element.type}-${element.id}`,
          name: element.tags?.name ?? category.label,
          category: category.id,
          lon,
          lat,
          address: buildAddress(element.tags),
          imageUrl: resolveImageUrl(element.tags),
          distanceFromStopKm: distanceBetweenKm(point, { lon, lat }),
        }))
        .filter((poi) => poi.distanceFromStopKm * 1000 <= POI_SEARCH_RADIUS_METERS)
        .sort((a, b) => a.distanceFromStopKm - b.distanceFromStopKm)
        .slice(0, MAX_POIS_PER_CATEGORY_PER_STOP);

      categoryResults[category.id] = matches;
    }

    resultsByStop.set(point.stopId, categoryResults);
  }

  return { resultsByStop, fetchFailed: false };
}
