import { NextResponse } from "next/server";
/** * ============================================================ * TOMTOM SEARCH PROXY * ============================================================ * * Proxy server cho TomTom Search API. * * Vai trò: * * - Giữ TOMTOM_API_KEY ở server. * - Không expose API key ra client. * - Chỉ forward một request search. * - Không tự giới hạn `limit`. * - Giữ nguyên 429 để client fallback sang Nominatim. * - Giữ nguyên lỗi 5xx. */ interface TomTomSearchRequest {
  query: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  countrySet?: string;
  entityTypeSet?: string;
}

interface TomTomSearchResultItem {
  id: string;
  poi?: { name?: string };
  type?: string;
  entityType?: string;
  address?: { freeformAddress?: string };
  position?: { lat: number; lon: number };
}

interface TomTomSearchResponse {
  results?: TomTomSearchResultItem[];
  error?: { description?: string };
}

export interface TomTomSearchApiResult {
  id: string;
  name: string | null;
  address: string | null;
  lat: number;
  lon: number;
  type?: string;
  entityType?: string;
}
export async function POST(request: Request) {
  /** * ========================================================== * 1. API KEY * ========================================================== */ const apiKey =
    process.env.TOMTOM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing TOMTOM_API_KEY" },
      { status: 500 },
    );
  }
  /** * ========================================================== * 2. REQUEST BODY * ========================================================== */ let body: TomTomSearchRequest;
  try {
    body = (await request.json()) as TomTomSearchRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ results: [], provider: "tomtom" });
  }
  /** * ========================================================== * 3. TOMTOM URL * ========================================================== */ const url =
    new URL(
      `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`,
    );
  /** * API KEY. */ url.searchParams.set("key", apiKey);
  /** * Mặc định chỉ tìm ở Việt Nam. */ url.searchParams.set(
    "countrySet",
    body.countrySet ?? "VN",
  );
  /** * Ngôn ngữ. */ url.searchParams.set("language", "vi-VN");
  /** * ========================================================== * QUAN TRỌNG: KHÔNG SET LIMIT * ========================================================== * * Không dùng: * * url.searchParams.set("limit", ...) * * TomTom sẽ sử dụng giới hạn mặc định của API. */ /** * ========================================================== * ENTITY TYPE * ========================================================== * * Hiện tại searchPlaces() không gửi entityTypeSet. * * Giữ hỗ trợ tham số này để các API khác của Mỳ Gõ Map * vẫn có thể sử dụng route này nếu cần. */ if (
    body.entityTypeSet
  ) {
    url.searchParams.set("entityTypeSet", body.entityTypeSet);
  }
  /** * ========================================================== * LOCATION BIAS * ========================================================== */ if (
    typeof body.lat === "number" &&
    typeof body.lon === "number"
  ) {
    url.searchParams.set("lat", String(body.lat));
    url.searchParams.set("lon", String(body.lon));
  }
  /** * ========================================================== * RADIUS * ========================================================== */ if (
    typeof body.radiusMeters === "number" &&
    body.radiusMeters > 0
  ) {
    url.searchParams.set("radius", String(Math.round(body.radiusMeters)));
  }
  /** * ========================================================== * 4. CALL TOMTOM * ========================================================== */ let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      /** * Không cache trực tiếp ở proxy. * * Cache sẽ xử lý ở service layer sau này. */ cache:
        "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Không gọi được TomTom Search: ${String(error)}`,
        provider: "tomtom",
        fallbackRecommended: true,
      },
      { status: 502 },
    );
  }
  /** * ========================================================== * 5. PARSE RESPONSE * ========================================================== */ const data =
    (await response.json().catch(() => null)) as TomTomSearchResponse | null;
  /** * ========================================================== * 6. TOMTOM 429 * ========================================================== * * Giữ nguyên 429. * * Client sẽ: * * TomTom * ↓ * 429 * ↓ * Nominatim */ if (
    response.status === 429
  ) {
    return NextResponse.json(
      {
        error:
          data?.error?.description ??
          "TomTom API đang bị giới hạn request hoặc đã hết quota.",
        provider: "tomtom",
        fallbackRecommended: true,
      },
      {
        status: 429,
        headers: { "Retry-After": response.headers.get("retry-after") ?? "60" },
      },
    );
  }
  /** * ========================================================== * 7. OTHER ERRORS * ========================================================== */ if (
    !response.ok ||
    !data
  ) {
    return NextResponse.json(
      {
        error:
          data?.error?.description ?? `TomTom search error ${response.status}`,
        provider: "tomtom",
        fallbackRecommended: response.status >= 500,
      },
      { status: response.status >= 400 ? response.status : 502 },
    );
  }
  /** * ========================================================== * 8. NORMALIZE RESULTS * ========================================================== */ const results: TomTomSearchApiResult[] =
    (data.results ?? [])
      .filter((item) => item.position)
      .map((item) => ({
        id: item.id,
        name: item.poi?.name ?? null,
        address: item.address?.freeformAddress ?? null,
        lat: item.position!.lat,
        lon: item.position!.lon,
        type: item.type,
        entityType: item.entityType,
      }));
  /** * ========================================================== * 9. RESPONSE * ========================================================== */ return NextResponse.json(
    { results, provider: "tomtom" },
  );
}
