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

function buildTomTomInstruction(message: string, streetName?: string): string {
  const normalized = message.trim().toLowerCase();

  if (!message) {
    return streetName ? `Tiếp tục vào ${streetName}` : "Tiếp tục di chuyển";
  }

  if (
    normalized.includes("you have arrived") ||
    normalized.includes("arrived at") ||
    normalized.includes("destination")
  ) {
    return streetName ? `Đã đến ${streetName}` : "Đã đến nơi";
  }

  if (
    normalized.startsWith("leave from") ||
    normalized.includes("depart from") ||
    normalized.includes("start from")
  ) {
    return streetName ? `Xuất phát từ ${streetName}` : "Xuất phát";
  }

  if (normalized.includes("sharp left")) {
    return streetName ? `Rẽ trái gắt vào ${streetName}` : "Rẽ trái gắt";
  }

  if (normalized.includes("sharp right")) {
    return streetName ? `Rẽ phải gắt vào ${streetName}` : "Rẽ phải gắt";
  }

  if (normalized.includes("slight left")) {
    return streetName ? `Rẽ trái nhẹ vào ${streetName}` : "Rẽ trái nhẹ";
  }

  if (normalized.includes("slight right")) {
    return streetName ? `Rẽ phải nhẹ vào ${streetName}` : "Rẽ phải nhẹ";
  }

  if (normalized.includes("turn left")) {
    return streetName ? `Rẽ trái vào ${streetName}` : "Rẽ trái";
  }

  if (normalized.includes("turn right")) {
    return streetName ? `Rẽ phải vào ${streetName}` : "Rẽ phải";
  }

  if (normalized.includes("keep left")) {
    return streetName
      ? `Đi theo làn bên trái vào ${streetName}`
      : "Đi theo làn bên trái";
  }

  if (normalized.includes("keep right")) {
    return streetName
      ? `Đi theo làn bên phải vào ${streetName}`
      : "Đi theo làn bên phải";
  }

  if (normalized.includes("continue")) {
    return streetName ? `Tiếp tục vào ${streetName}` : "Tiếp tục di chuyển";
  }

  if (normalized.includes("roundabout")) {
    return streetName
      ? `Vào vòng xoay theo hướng ${streetName}`
      : "Vào vòng xoay";
  }

  if (normalized.includes("u-turn") || normalized.includes("uturn")) {
    return streetName ? `Quay đầu vào ${streetName}` : "Quay đầu xe";
  }

  return streetName ? `Tiếp tục vào ${streetName}` : "Tiếp tục di chuyển";
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
  // Ô tô giữ "fastest" như cũ. Xe máy dùng "shortest" — TomTom mặc định
  // "fastest" cộng thêm chi phí ước tính thời gian chờ/lên-xuống phà nên gần
  // như luôn né phà dù ngắn hơn; "shortest" tối ưu thuần theo quãng đường
  // nên sẽ chọn tuyến qua phà nếu tuyến đó thực sự ngắn hơn.
  // url.searchParams.set(
  //   "routeType",
  //   body.avoidHighways ? "shortest" : "fastest",
  // );

  url.searchParams.set("routeType", "fastest");
  // 3. Giới hạn tốc độ tối đa của xe máy (ví dụ 60-70 km/h).
  // Việc này giúp TomTom không ảo tưởng tốc độ xe máy trên đường lộ rộng,
  // từ đó phà Cát Lái (tiết kiệm hơn 20km) vẫn sẽ thắng về mặt thời gian (Fastest),
  // nhưng các phà nhỏ đi Cần Thơ (chỉ tiết kiệm 1-2km) sẽ thua QL1A về thời gian.
  url.searchParams.set("vehicleMaxSpeed", "60");

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

    const streetName =
      instruction.street && instruction.street !== "-"
        ? instruction.street
        : undefined;

    return {
      distanceMeters: Math.max(0, nextOffset - instruction.routeOffsetInMeters),
      instruction: buildTomTomInstruction(
        instruction.message ?? "",
        streetName,
      ),
      streetName,
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
