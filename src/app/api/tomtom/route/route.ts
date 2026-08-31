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
// Một chỉ dẫn rẽ trong `guidance.instructions[]` — chỉ có khi request có
// `instructionsType=text` (xem bên dưới). `routeOffsetInMeters` là khoảng
// cách TÍNH TỪ ĐIỂM XUẤT PHÁT tới nơi thực hiện thao tác này, dùng để suy
// ra quãng đường của từng chặng (còn bao nhiêu m thì rẽ).
interface TomTomGuidanceInstruction {
  routeOffsetInMeters: number;
  street?: string;
  message?: string;
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
    guidance?: {
      instructions: TomTomGuidanceInstruction[];
    };
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
  // Xe máy dùng đúng travelMode "motorcycle" — profile xe 2 bánh có động cơ
  // thật của TomTom (tốc độ, luật đường đúng cho xe máy, khác hẳn "car" lẫn
  // "bicycle"). Ô tô vẫn dùng "car" như cũ, ưu tiên cao tốc tự nhiên qua
  // routeType=fastest, không cần cấu hình avoid gì thêm.
  url.searchParams.set("travelMode", body.avoidHighways ? "motorcycle" : "car");
  url.searchParams.set("routeRepresentation", "polyline");
  url.searchParams.set("computeTravelTimeFor", "all");
  url.searchParams.set("sectionType", "traffic");
  // Bảng chỉ dẫn rẽ từng chặng kiểu ggmap ("còn Xm thì rẽ trái vào ABC") —
  // "text" để TomTom dựng sẵn câu hướng dẫn hoàn chỉnh trong `message`,
  // "vi-VN" để câu đó bằng tiếng Việt.
  url.searchParams.set("instructionsType", "text");
  url.searchParams.set("language", "vi-VN");

  if (body.avoidHighways) {
    // CHỈ né cao tốc. KHÔNG né "tollRoads" nữa — trạm thu phí BOT trên quốc
    // lộ thường (không phải cao tốc) vẫn hợp lệ và cần thiết cho xe máy đi
    // qua bình thường; né tollRoads sẽ chặn nhầm cả những trạm đó.
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
  // Suy ra quãng đường của từng chặng bằng hiệu `routeOffsetInMeters` giữa
  // chỉ dẫn hiện tại và chỉ dẫn kế tiếp (chặng cuối lấy tới hết tổng quãng
  // đường), vì TomTom chỉ trả offset TÍCH LŨY chứ không trả sẵn độ dài từng
  // chặng.
  const instructions = route.guidance?.instructions ?? [];
  const steps = instructions.map((instruction, index) => {
    const nextInstruction = instructions[index + 1];

    const nextOffset =
      nextInstruction !== undefined
        ? nextInstruction.routeOffsetInMeters
        : route.summary.lengthInMeters;
    return {
      distanceMeters: Math.max(0, nextOffset - instruction.routeOffsetInMeters),
      instruction: instruction.message ?? "",
      streetName: instruction.street || undefined,
    };
  });
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
    steps,
  });
}
