/**
 * Optional integration with Mapillary — a free, street-level imagery service
 * (signup required, no credit card: https://www.mapillary.com/dashboard/developers).
 *
 * WHY THIS EXISTS: Wikimedia Commons (the other free image source in this app)
 * mostly only has photos of notable landmarks. Mapillary has genuine street-level
 * photo coverage of ordinary streets and storefronts contributed by its
 * community — this is what actually closes the gap toward "a real photo of
 * this specific small quán ăn / trạm xăng", the way Google Maps does via its
 * (paid, proprietary) Places Photos database.
 *
 * Without a token this function is skipped entirely and the app falls back to
 * Wikimedia Commons / a category icon — nothing breaks, you simply get less
 * photo coverage. Set NEXT_PUBLIC_MAPILLARY_TOKEN in .env.local to enable it.
 */

interface MapillaryImage {
  thumb_1024_url?: string;
}

interface MapillarySearchResponse {
  data?: MapillaryImage[];
}

const MAPILLARY_GRAPH_URL = "https://graph.mapillary.com/images";

/** How close a street-level photo must be to the POI to plausibly show "this place". */
const SEARCH_RADIUS_METERS = 50;

/**
 * Finds the nearest Mapillary street-level photo to a coordinate, if any
 * exists and a token is configured. Never throws — resolves to null on any
 * failure (missing token, no coverage in that area, network error, etc.).
 */
export async function findNearbyMapillaryImage(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPILLARY_TOKEN;
  if (!token) return null;

  const url = new URL(MAPILLARY_GRAPH_URL);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", "thumb_1024_url");
  // Mapillary's docs advertise `closeto` (lon,lat) for proximity search, but
  // combining it with `radius` actually errors with "The 'lat' and 'lng'
  // parameters are required when 'radius' is provided" — so when filtering
  // by radius, it wants separate `lat`/`lng` params instead of `closeto`.
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lon));
  url.searchParams.set("radius", String(SEARCH_RADIUS_METERS));
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) {
      // Log the reason instead of failing silently — this is exactly how the
      // earlier "radius must be <= 50" bug was hidden from view. We still
      // return null (not throw) so a Mapillary hiccup never blocks the photo
      // from falling back to Wikimedia Commons.
      const body = await response.text().catch(() => "");
      console.warn(`Mapillary API trả về lỗi ${response.status}: ${body}`);
      return null;
    }

    const data = (await response.json()) as MapillarySearchResponse;
    return data.data?.[0]?.thumb_1024_url ?? null;
  } catch (err) {
    // Network hiccup, aborted, or CORS issue — degrade silently to the next
    // fallback source rather than surfacing an error for a non-critical photo.
    console.warn(
      "Mapillary API request thất bại:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
