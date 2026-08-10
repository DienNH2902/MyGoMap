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

export class RoutingError extends Error {}

/**
 * Requests a driving route between two points from OpenRouteService — a free,
 * key-based routing API that (unlike the OSRM public demo server) is safe to
 * call from a real app within its free-tier limits. Runs entirely client-side.
 */
export async function fetchDrivingRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
): Promise<RouteGeometry> {
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey) {
    throw new RoutingError(
      "Thiếu NEXT_PUBLIC_ORS_API_KEY. Hãy lấy API key miễn phí tại openrouteservice.org và thêm vào file .env.local.",
    );
  }

  // ORS v2 requires POST with the API key in the Authorization header and the
  // coordinates in a JSON body — the old GET-with-query-params form now
  // returns 405 Method Not Allowed.
  const response = await fetch(ORS_DIRECTIONS_URL, {
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
    }),
  });
  if (!response.ok) {
    throw new RoutingError(
      `Không thể tính lộ trình (mã lỗi ${response.status}). Vui lòng thử lại.`,
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
