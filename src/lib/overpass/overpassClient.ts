import {
  OVERPASS_INTERPRETER_URL,
  POI_SEARCH_RADIUS_METERS,
  MAX_POIS_PER_CATEGORY_PER_STOP,
} from '../constants';
import { distanceBetweenKm } from '../geo/turfHelpers';
import type { PoiCategoryDefinition, PoiResult } from '../types';

interface OverpassTags {
  name?: string;
  'addr:housenumber'?: string;
  'addr:street'?: string;
  'addr:city'?: string;
  image?: string;
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

/** Joins the OSM address tags into a single readable line, when present. */
function buildAddress(tags: OverpassTags | undefined): string | undefined {
  if (!tags) return undefined;
  const parts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * Retry helper với exponential backoff cho Overpass API
 * Giải pháp 2: Xử lý lỗi 429 (Too Many Requests)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Nếu bị rate limit, đợi và thử lại
      if (response.status === 429) {
        const waitTime = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        console.warn(`Rate limited by Overpass API. Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Unknown error');
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`Request failed. Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Queries the free Overpass API for real-world points of interest of the given
 * categories within `POI_SEARCH_RADIUS_METERS` of a stop point, sorted by
 * distance and capped per category. This is the "search around, filter by my
 * own criteria" step of the custom stop-suggestion algorithm.
 * 
 * Giải pháp 4: Chia categories thành batches để tránh query quá phức tạp
 */
export async function findPoisNearPoint(
  center: { lon: number; lat: number },
  categories: PoiCategoryDefinition[],
  signal?: AbortSignal
): Promise<Record<string, PoiResult[]>> {
  const result: Record<string, PoiResult[]> = {};
  if (categories.length === 0) return result;

  // Giải pháp 4: Chia categories thành các batch nhỏ (tối đa 3 categories/request)
  const MAX_CATEGORIES_PER_REQUEST = 3;
  const batches: PoiCategoryDefinition[][] = [];

  for (let i = 0; i < categories.length; i += MAX_CATEGORIES_PER_REQUEST) {
    batches.push(categories.slice(i, i + MAX_CATEGORIES_PER_REQUEST));
  }

  // Query từng batch với delay
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    // Delay giữa các batch để tránh rate limit
    if (batchIndex > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const batch = batches[batchIndex];
    const clauses = batch
      .map(
        (category) =>
          `node["${category.osmKey}"="${category.osmValue}"](around:${POI_SEARCH_RADIUS_METERS},${center.lat},${center.lon});`
      )
      .join('\n');

    // Giải pháp 3: Tăng timeout từ 25 lên 60 giây
    const query = `[out:json][timeout:60];(${clauses});out center tags;`;

    // Giải pháp 2: Sử dụng fetchWithRetry thay vì fetch trực tiếp
    const response = await fetchWithRetry(
      OVERPASS_INTERPRETER_URL,
      {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Không thể tải dữ liệu địa điểm xung quanh (mã lỗi ${response.status}).`);
    }

    const data = (await response.json()) as OverpassResponse;

    for (const category of batch) {
      const matches = data.elements
        .filter((element) => element.tags?.[category.osmKey] === category.osmValue)
        .map((element): PoiResult | null => {
          const lat = element.lat ?? element.center?.lat;
          const lon = element.lon ?? element.center?.lon;
          if (lat === undefined || lon === undefined) return null;

          return {
            id: `${category.id}-${element.type}-${element.id}`,
            name: element.tags?.name ?? category.label,
            category: category.id,
            lon,
            lat,
            address: buildAddress(element.tags),
            imageUrl: element.tags?.image,
            distanceFromStopKm: distanceBetweenKm(center, { lon, lat }),
          };
        })
        .filter((poi): poi is PoiResult => poi !== null)
        .sort((a, b) => a.distanceFromStopKm - b.distanceFromStopKm)
        .slice(0, MAX_POIS_PER_CATEGORY_PER_STOP);

      result[category.id] = matches;
    }
  }

  return result;
}
