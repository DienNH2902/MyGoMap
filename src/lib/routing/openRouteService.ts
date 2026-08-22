import {
  ORS_DIRECTIONS_URL,
  MOTORBIKE_AVERAGE_SPEED_KMH,
  CAR_AVERAGE_SPEED_KMH,
} from "../constants";
import type { RouteGeometry } from "../types";
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

export async function fetchDrivingRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  routeOptions: RouteOptions = {},
  viaPoints: Array<{ lon: number; lat: number }> = [],
): Promise<RouteGeometry> {
  // XE MÁY: luôn ưu tiên TomTom (travelMode=motorcycle) trước — GỌI BẤT KỂ
  // useTraffic đang true hay false (đây là điểm hay bị hiểu lầm do tên hàm
  // cũ). useTraffic ở đây chỉ ảnh hưởng việc TomTom có tính traffic thời
  // gian thực vào ETA hay không — KHÔNG quyết định có gọi TomTom hay không.
  // Đây là API DUY NHẤT trong dự án có đúng profile xe 2 bánh có động cơ
  // thật, không phải "mượn tạm" đồ thị xe đạp (sai tốc độ/luật đường) hay chỉ
  // dựa vào avoid_features (chỉ là gợi ý mềm, ORS driving-car vẫn có thể lỡ
  // đi vào cao tốc nếu đường thay thế bị đánh giá là quá tệ — đây chính là lý
  // do tuyến HCM–Cần Thơ trước đây vẫn bị đẩy vào CT01 dù đã bật avoid_features).
  if (routeOptions.avoidHighways) {
    try {
      return await fetchTomTomRoute(
        start,
        end,
        { avoidHighways: true, useTraffic: routeOptions.useTraffic ?? false },
        viaPoints,
      );
    } catch (err) {
      // TomTom lỗi hoặc thiếu TOMTOM_API_KEY → âm thầm rơi về ORS (driving-car
      // + avoid_features: ["highways"]) làm phương án dự phòng, KHÔNG hiển
      // thị lỗi ngược lại cho người dùng. Đây là best-effort: hiếm khi ORS
      // vẫn có thể đi một đoạn cao tốc ngắn nếu tuyệt đối không có đường
      // thay thế nào khác, nhưng vẫn tốt hơn nhiều so với báo lỗi trắng.
      console.warn(
        "TomTom routing (xe máy) thất bại, dùng ORS làm phương án dự phòng — kém chính xác hơn khi né cao tốc:",
        err instanceof Error ? err.message : err,
      );
    }
  } else if (routeOptions.useTraffic) {
    return fetchTomTomRoute(
      start,
      end,
      { avoidHighways: false, useTraffic: true },
      viaPoints,
    );
  }

  // ORS driving-car: dùng làm định tuyến CHÍNH cho ô tô (ưu tiên cao tốc tự
  // nhiên qua preference "fastest" mặc định, không cần cấu hình gì thêm), và
  // làm phương án DỰ PHÒNG cho xe máy khi nhánh TomTom phía trên gặp lỗi.
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

  return {
    coordinates: feature.geometry.coordinates,
    distanceKm,
    durationMinutes: routeOptions.avoidHighways
      ? estimateMotorbikeDurationMinutes(distanceKm)
      : estimateCarDurationMinutes(distanceKm),
  };
}
