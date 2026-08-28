import { NOMINATIM_SEARCH_URL } from "../constants";
import type { PlaceResult } from "../types";

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
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  userLocation?: { lat: number; lon: number } | null,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", `${trimmed}*`);
  url.searchParams.set("format", "json");
  url.searchParams.set("countrycodes", "vn");
  // url.searchParams.set("limit", "5");
  url.searchParams.set("accept-language", "vi");

  const response = await fetch(url.toString(), {
    signal,
    headers: {
      Accept: "application/json",
      // Bắt buộc đối với Nominatim Policy
      "User-Agent": "MyGoMapApp/1.0",
    },
  });
  if (!response.ok) return [];

  const items = (await response.json()) as NominatimItem[];
  const results = items.map((item) => ({
    id: String(item.place_id),
    label: item.display_name,
    lon: Number(item.lon),
    lat: Number(item.lat),
  }));

  if (!userLocation) {
    return results;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;

  const getDistance = (lat: number, lon: number) => {
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

  return results
    .map((result) => ({
      ...result,
      distance: getDistance(result.lat, result.lon),
    }))
    .sort((a, b) => a.distance - b.distance)
    .map(({ distance: _distance, ...result }) => result);
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
