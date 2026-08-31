import {
  ORS_DIRECTIONS_URL,
  MOTORBIKE_AVERAGE_SPEED_KMH,
  CAR_AVERAGE_SPEED_KMH,
} from "../constants";
import type { RouteGeometry, RouteStep } from "../types";
import { fetchTomTomRoute } from "./tomTomTrafficRoute";

/** Shape of the fields we actually read from an ORS GeoJSON directions response. */
interface OrsGeoJsonResponse {
  features: Array<{
    geometry: { coordinates: [number, number][] };
    properties: {
      summary: {
        distance: number; // meters
        duration: number; // seconds
      };
      // Chỉ dẫn rẽ từng chặng — ORS trả sẵn khi `instructions: true` (mặc
      // định), ta chỉ cần đọc thêm để dựng bảng "còn Xm thì rẽ..." như ggmap.
      segments: Array<{
        steps: Array<{
          distance: number; // meters, quãng đường của chặng này trước khi rẽ
          duration: number; // seconds
          type: number; // mã loại thao tác (rẽ trái/phải/đi thẳng...) của ORS
          instruction: string; // câu hướng dẫn đầy đủ, theo `language` đã gửi
          name: string; // tên đường của chặng này, "-" nếu đường không tên
        }>;
      }>;
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

const TOMTOM_MAX_ROUTE_DISTANCE_KM = 400;

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
  useTraffic?: boolean;
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
/**
 * ORS's "driving-car" duration assumes car speeds even when we asked it to
 * avoid highways for a motorbike route — see MOTORBIKE_AVERAGE_SPEED_KMH in
 * constants.ts for why. This recomputes a realistic xe máy ETA from distance
 * instead of trusting ORS's (car-speed) duration for that case.
 */
function estimateMotorbikeDurationMinutes(distanceKm: number): number {
  return (distanceKm / MOTORBIKE_AVERAGE_SPEED_KMH) * 60;
}

function estimateCarDurationMinutes(distanceKm: number): number {
  return (distanceKm / CAR_AVERAGE_SPEED_KMH) * 60;
}

/** Dựng bảng chỉ dẫn rẽ (kiểu ggmap) từ các `segments[].steps[]` mà ORS trả về. */
function parseOrsSteps(
  segments: OrsGeoJsonResponse["features"][number]["properties"]["segments"],
): RouteStep[] {
  return segments.flatMap((segment) =>
    segment.steps.map((step) => ({
      distanceMeters: step.distance,
      instruction: step.instruction,
      streetName: step.name && step.name !== "-" ? step.name : undefined,
    })),
  );
}

export async function fetchDrivingRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  routeOptions: RouteOptions = {},
  viaPoints: Array<{ lon: number; lat: number }> = [],
): Promise<RouteGeometry> {
  // LUÔN gọi ORS trước để lấy tổng quãng đường.
  // ORS miễn phí hơn và không bị giới hạn request như TomTom.
  // Sau khi biết chính xác quãng đường, chỉ xe máy (avoidHighways=true) trên
  // tuyến dưới 400km mới được gọi lại bằng TomTom để lấy tuyến chính xác
  // hơn (né cao tốc đúng luật). Ô tô luôn dùng thẳng kết quả ORS.
  const apiKey = process.env.NEXT_PUBLIC_ORS_API_KEY;
  if (!apiKey) {
    throw new RoutingError(
      "Thiếu NEXT_PUBLIC_ORS_API_KEY. Hãy lấy API key miễn phí tại openrouteservice.org và thêm vào file .env.local.",
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ORS_TIMEOUT_MS);

  const coordinates = [
    [start.lon, start.lat],
    ...viaPoints.map((point) => [point.lon, point.lat]),
    [end.lon, end.lat],
  ];

  // Tăng bán kính "bắt dính" vào đường lên mức tối đa ORS cho phép (-1),
  // thay vì mặc định 350m — đây là fix chính thức cho lỗi
  // "Could not find routable point" với các toạ độ xa đường (tâm tỉnh, sân bay...).
  const radiuses = coordinates.map(() => -1);

  let response: Response;
  try {
    response = await fetch(ORS_DIRECTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates,
        radiuses,
        // Chỉ dẫn rẽ (turn-by-turn) trả về bằng tiếng Việt.
        language: "vi",
        options: {
          avoid_borders: "all",
          // CHỈ né "highways" (cao tốc). KHÔNG bao giờ thêm "tollways" —
          // trạm thu phí BOT trên quốc lộ thường vẫn hợp lệ và cần thiết
          // cho xe máy, "tollways" sẽ né nhầm cả những trạm đó.
          ...(routeOptions.avoidHighways
            ? { avoid_features: ["highways"] }
            : {}),
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
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
    let detail = `mã lỗi ${response.status}`;
    try {
      const errorBody = (await response.json()) as OrsErrorResponse;
      const message =
        typeof errorBody.error === "string"
          ? errorBody.error
          : errorBody.error?.message;
      if (message) detail = message;
    } catch {}

    throw new RoutingError(
      `Không thể tính lộ trình (Lỗi: ${detail}). Lộ trình cần phải ở trên đất liền - Trên đường bộ - Trong phạm vi nước Việt Nam - Vui lòng thử lại.`,
    );
  }

  const data = (await response.json()) as OrsGeoJsonResponse;
  const feature = data.features[0];
  if (!feature) {
    throw new RoutingError(
      "Không tìm thấy lộ trình phù hợp giữa các điểm này.",
    );
  }

  const distanceKm = feature.properties.summary.distance / 1000;
  const steps = parseOrsSteps(feature.properties.segments);

  // CHỈ xe máy (avoidHighways=true) mới cần TomTom — API duy nhất có
  // travelMode="motorcycle" thật để né cao tốc đúng luật — và chỉ khi tuyến
  // dưới 400km để tiết kiệm request TomTom (có giới hạn). Ô tô luôn dùng
  // thẳng kết quả ORS, không bao giờ gọi TomTom.
  if (routeOptions.avoidHighways && distanceKm < TOMTOM_MAX_ROUTE_DISTANCE_KM) {
    try {
      return await fetchTomTomRoute(
        start,
        end,
        {
          avoidHighways: routeOptions.avoidHighways,
          useTraffic: routeOptions.useTraffic,
        },
        viaPoints,
      );
    } catch (err) {
      // TomTom lỗi hoặc thiếu API key → giữ nguyên tuyến ORS đã tính.
      // Không để lỗi TomTom làm mất tuyến đường đã có.
      console.warn(
        "TomTom routing thất bại, sử dụng tuyến ORS đã tính trước đó:",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    coordinates: feature.geometry.coordinates,
    distanceKm,
    durationMinutes: routeOptions.avoidHighways
      ? estimateMotorbikeDurationMinutes(distanceKm)
      : estimateCarDurationMinutes(distanceKm),
    steps,
  };
}
