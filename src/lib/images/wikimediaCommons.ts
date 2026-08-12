/**
 * Free, no-key fallback photo source: searches Wikimedia Commons for a photo
 * geotagged near a coordinate. Commons' coverage skews toward landmarks and
 * notable buildings rather than ordinary small businesses, so this is used
 * as a fallback AFTER Mapillary (see mapillaryClient.ts), not the primary
 * source — but it requires zero setup and works for everyone out of the box.
 */

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
}

interface CommonsPage {
  imageinfo?: CommonsImageInfo[];
}

interface CommonsQueryResponse {
  query?: {
    pages?: Record<string, CommonsPage>;
  };
}

const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';
const SEARCH_RADIUS_METERS = 400;

/**
 * Finds a Wikimedia Commons photo geotagged near a coordinate. Never throws —
 * resolves to null on any failure or when nothing is found nearby.
 */
export async function findNearbyCommonsImage(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<string | null> {
  const url = new URL(COMMONS_API_URL);
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'geosearch');
  url.searchParams.set('ggscoord', `${lat}|${lon}`);
  url.searchParams.set('ggsradius', String(SEARCH_RADIUS_METERS));
  url.searchParams.set('ggslimit', '1');
  url.searchParams.set('ggsnamespace', '6'); // File: namespace only
  url.searchParams.set('prop', 'imageinfo');
  url.searchParams.set('iiprop', 'url');
  url.searchParams.set('iiurlwidth', '400');
  url.searchParams.set('format', 'json');
  // Required for browser-side CORS access to Wikimedia's API (their documented method).
  url.searchParams.set('origin', '*');

  try {
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) return null;
    const data = (await response.json()) as CommonsQueryResponse;
    const pages = data.query?.pages;
    if (!pages) return null;

    const firstPage = Object.values(pages)[0];
    const info = firstPage?.imageinfo?.[0];
    return info?.thumburl ?? info?.url ?? null;
  } catch {
    return null;
  }
}

/**
 * Tries Mapillary first (better coverage of ordinary places when configured),
 * then falls back to Commons (landmark-oriented, but needs no setup). Used by
 * StopDetailDrawer as the single entry point for "find me any real photo of
 * this coordinate" — callers don't need to know about the two sources.
 */
export async function findNearbyImage(
  lat: number,
  lon: number,
  signal: AbortSignal,
  findMapillaryImage: (lat: number, lon: number, signal?: AbortSignal) => Promise<string | null>
): Promise<string | null> {
  const mapillaryResult = await findMapillaryImage(lat, lon, signal);
  if (mapillaryResult) return mapillaryResult;
  return findNearbyCommonsImage(lat, lon, signal);
}