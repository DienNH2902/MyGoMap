import { NOMINATIM_SEARCH_URL } from '../constants';
import type { PlaceResult } from '../types';

interface NominatimItem {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
}

/**
 * Searches for places by free-text query using the free Nominatim (OpenStreetMap)
 * geocoding API, biased toward Vietnam. Per Nominatim's usage policy this is fine
 * for light, client-side, non-bulk use — browsers send a Referer header automatically,
 * which satisfies their attribution requirement without needing a backend proxy.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set('q', trimmed);
  url.searchParams.set('format', 'json');
  url.searchParams.set('countrycodes', 'vn');
  url.searchParams.set('limit', '5');
  url.searchParams.set('accept-language', 'vi');

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];

  const items = (await response.json()) as NominatimItem[];
  return items.map((item) => ({
    id: String(item.place_id),
    label: item.display_name,
    lon: Number(item.lon),
    lat: Number(item.lat),
  }));
}
