import { NextResponse } from "next/server";

interface TomTomRoutePoint {
  lon: number;
  lat: number;
}

interface TomTomRouteRequest {
  points: TomTomRoutePoint[];
  avoidHighways?: boolean;
  useTraffic?: boolean;
}

interface TomTomRouteResponse {
  routes?: Array<{
    summary: {
      lengthInMeters: number;
      travelTimeInSeconds: number;
      noTrafficTravelTimeInSeconds?: number;
      trafficDelayInSeconds?: number;
    };
    legs: Array<{
      points: Array<{
        latitude: number;
        longitude: number;
      }>;
    }>;
  }>;
  error?: {
    description?: string;
    detailedError?: {
      message?: string;
    };
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing TOMTOM_API_KEY" },
      { status: 500 },
    );
  }

  const body = (await request.json()) as TomTomRouteRequest;
  const points = body.points ?? [];

  if (points.length < 2) {
    return NextResponse.json(
      { error: "Route needs at least start and end points." },
      { status: 400 },
    );
  }

  const routeLocations = points
    .map((point) => `${point.lat},${point.lon}`)
    .join(":");

  const url = new URL(
    `https://api.tomtom.com/routing/1/calculateRoute/${routeLocations}/json`,
  );

  url.searchParams.set("key", apiKey);
  url.searchParams.set("routeType", "fastest");
  url.searchParams.set("traffic", body.useTraffic === false ? "false" : "true");
  url.searchParams.set("travelMode", "car");
  url.searchParams.set("routeRepresentation", "polyline");
  url.searchParams.set("computeTravelTimeFor", "all");
  url.searchParams.set("sectionType", "traffic");

  if (body.avoidHighways) {
    url.searchParams.append("avoid", "motorways");
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  const data = (await response.json()) as TomTomRouteResponse;

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          data.error?.detailedError?.message ??
          data.error?.description ??
          `TomTom route error ${response.status}`,
      },
      { status: response.status },
    );
  } 

  const route = data.routes?.[0];

  if (!route) {
    return NextResponse.json(
      { error: "TomTom không tìm thấy lộ trình phù hợp." },
      { status: 404 },
    );
  }

  const coordinates = route.legs.flatMap((leg) =>
    leg.points.map((point) => [point.longitude, point.latitude]),
  );

  return NextResponse.json({
    coordinates,
    distanceKm: route.summary.lengthInMeters / 1000,
    durationMinutes: route.summary.travelTimeInSeconds / 60,
    noTrafficDurationMinutes:
      typeof route.summary.noTrafficTravelTimeInSeconds === "number"
        ? route.summary.noTrafficTravelTimeInSeconds / 60
        : undefined,
    trafficDelayMinutes:
      typeof route.summary.trafficDelayInSeconds === "number"
        ? route.summary.trafficDelayInSeconds / 60
        : undefined,
  });
}
