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
 * Queries the free Overpass API for real-world points of interest of the given
 * categories within `POI_SEARCH_RADIUS_METERS` of a stop point, sorted by
 * distance and capped per category. This is the "search around, filter by my
 * own criteria" step of the custom stop-suggestion algorithm.
 */
export async function findPoisNearPoint(
  center: { lon: number; lat: number },
  categories: PoiCategoryDefinition[],
  signal?: AbortSignal
): Promise<Record<string, PoiResult[]>> {
  const result: Record<string, PoiResult[]> = {};
  if (categories.length === 0) return result;

  const clauses = categories
    .map(
      (category) =>
        `node["${category.osmKey}"="${category.osmValue}"](around:${POI_SEARCH_RADIUS_METERS},${center.lat},${center.lon});`
    )
    .join('\n');

  const query = `[out:json][timeout:25];(${clauses});out center tags;`;

  const response = await fetch(OVERPASS_INTERPRETER_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Không thể tải dữ liệu địa điểm xung quanh (mã lỗi ${response.status}).`);
  }

  const data = (await response.json()) as OverpassResponse;

  for (const category of categories) {
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

  return result;
}
