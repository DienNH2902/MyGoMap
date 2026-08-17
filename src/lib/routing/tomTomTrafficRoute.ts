import type { RouteGeometry } from "../types";
import { RoutingError } from "./openRouteService";

export interface TomTomTrafficRouteOptions {
  avoidHighways?: boolean;
  useTraffic?: boolean;
}

export async function fetchTomTomTrafficRoute(
  start: { lon: number; lat: number },
  end: { lon: number; lat: number },
  options: TomTomTrafficRouteOptions = {},
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
    throw new RoutingError(
      data.error ?? "Không thể tính lộ trình theo giao thông hiện tại.",
    );
  }

  return data as RouteGeometry;
}
