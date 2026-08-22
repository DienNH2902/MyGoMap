import type { RouteGeometry } from "../types";
import { RoutingError } from "./openRouteService";

export interface TomTomRouteOptions {
  avoidHighways?: boolean;
  useTraffic?: boolean;
}

/**
 * Gọi TomTom Routing API — dùng cho 2 mục đích ĐỘC LẬP với nhau:
 * 1) Xe máy (avoidHighways=true): LUÔN được gọi, bất kể useTraffic true/false
 *    — vì đây là API duy nhất trong dự án có travelMode="motorcycle" thật để
 *    né cao tốc đúng cách (xem fetchDrivingRoute trong openRouteService.ts).
 * 2) Ô tô + bật nút Traffic (useTraffic=true): gọi để lấy thời gian có tính
 *    traffic thời gian thực.
 * Tên hàm cũ "fetchTomTomTrafficRoute" dễ khiến tưởng nhầm nó chỉ chạy khi
 * bật Traffic — đã đổi tên để rõ ràng hơn, hành vi không đổi.
 */
export async function fetchTomTomRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  options: TomTomRouteOptions = {},
  viaPoints: Array<{ lon: number; lat: number }> = [],
): Promise<RouteGeometry> {
  const response = await fetch("/api/tomtom/route", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      points: [start, ...viaPoints, end],
      avoidHighways: options.avoidHighways,
      useTraffic: options.useTraffic,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 500 && data.error === "Missing TOMTOM_API_KEY") {
      // Lỗi cấu hình riêng biệt, dễ nhận biết ngay khi debug — khác hẳn lỗi
      // mạng/API tạm thời. Quan trọng nhất với chế độ xe máy: thiếu key này
      // khiến app tự rơi về ORS (kém chính xác hơn khi né cao tốc) thay vì
      // dùng đúng profile "motorcycle" của TomTom.
      throw new RoutingError(
        "Thiếu TOMTOM_API_KEY trong .env.local — cần key này để xe máy né cao tốc chính xác (ORS không có profile xe máy thật, chỉ dùng tạm làm dự phòng kém chính xác hơn).",
      );
    }
    throw new RoutingError(data.error ?? "Không thể tính lộ trình qua TomTom.");
  }

  return data as RouteGeometry;
}
