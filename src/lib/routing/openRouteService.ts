import { ORS_DIRECTIONS_URL } from "../constants";
import type { RouteGeometry } from "../types";

/** Shape of the fields we actually read from an ORS GeoJSON directions response. */
interface OrsGeoJsonResponse {
  features: Array<{
    geometry: { coordinates: [number, number][] };
    properties: {
      summary: {
        distance: number; // meters
        duration: number; // seconds
      };
    };
  }>;
}

/** ORS returns this shape when a request fails (invalid coords, no route found, etc). */
interface OrsErrorResponse {
  error?: { message?: string } | string;
}

export class RoutingError extends Error {}

/** How long we wait for ORS before giving up and telling the user to retry. */
const ORS_TIMEOUT_MS = 20000;

/** Extra routing preferences the caller can request. */
export interface RouteOptions {
  /**
   * When true, the route avoids "highways" (cao tốc / đường cao tốc — limited-
   * access expressways). Motorbikes are legally barred from these roads in
   * Vietnam, so without this, ORS's default shortest/fastest route can send a
   * xe máy trip down a road it's not allowed to use. Defaults to false (car
   * mode, highways allowed) to preserve prior behavior when not specified.
   */
  avoidHighways?: boolean;
}

/**
 * Requests a driving route between two points from OpenRouteService — a free,
 * key-based routing API that (unlike the OSRM public demo server) is safe to
 * call from a real app within its free-tier limits. Runs entirely client-side.
 *
 * IMPORTANT: `options.avoid_borders: "all"` is set below so the router never
 * produces a path that briefly crosses into Laos/Cambodia/China even when that
 * would be geometrically shorter (this happens on a few roads that hug the
 * Vietnamese border, e.g. sections of the Ho Chi Minh Trail). This keeps the
 * whole route inside Vietnam, which is what the app promises the user.
 */
export async function fetchDrivingRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  routeOptions: RouteOptions = {},
): Promise<RouteGeometry> {
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey) {
    throw new RoutingError(
      "Thiếu NEXT_PUBLIC_ORS_API_KEY. Hãy lấy API key miễn phí tại openrouteservice.org và thêm vào file .env.local.",
    );
  }

  // Abort the request ourselves after ORS_TIMEOUT_MS so a slow/unresponsive
  // ORS server can't hang the "Bắt đầu" button forever.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ORS_DIRECTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [start.lon, start.lat],
          [end.lon, end.lat],
        ],
        // Keep the entire route inside Vietnam — never cross a country border,
        // even if a cross-border shortcut would technically be faster. When
        // `avoidHighways` is on (xe máy mode), also tell ORS to route around
        // any "highways" (limited-access expressways) entirely, since those
        // are off-limits to motorbikes by law.
        options: {
          avoid_borders: "all",
          ...(routeOptions.avoidHighways
            ? { avoid_features: ["highways"] }
            : {}),
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // AbortError (timeout) or a genuine network failure both land here.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new RoutingError(
        "Yêu cầu tính lộ trình mất quá lâu (quá 20 giây). Vui lòng thử lại.",
      );
    }
    throw new RoutingError(
      "Không thể kết nối tới OpenRouteService. Vui lòng kiểm tra kết nối mạng và thử lại.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // Try to surface ORS's own error message (e.g. "could not find routable
    // point") instead of just the HTTP status code, since it's usually more
    // actionable for the user.
    let detail = `mã lỗi ${response.status}`;
    try {
      const errorBody = (await response.json()) as OrsErrorResponse;
      const message =
        typeof errorBody.error === "string"
          ? errorBody.error
          : errorBody.error?.message;
      if (message) detail = message;
    } catch {
      // Response wasn't JSON — keep the generic status-code message above.
    }
    throw new RoutingError(
      `Không thể tính lộ trình (Lỗi: ${detail}). Lộ trình cần phải ở trên đất liền - Trong phạm vi nước Việt Nam - Vui lòng thử lại.`,
    );
  }

  const data = (await response.json()) as OrsGeoJsonResponse;
  const feature = data.features[0];
  if (!feature) {
    throw new RoutingError(
      "Không tìm thấy lộ trình phù hợp giữa hai điểm này.",
    );
  }

  return {
    coordinates: feature.geometry.coordinates,
    distanceKm: feature.properties.summary.distance / 1000,
    durationMinutes: feature.properties.summary.duration / 60,
  };
}
