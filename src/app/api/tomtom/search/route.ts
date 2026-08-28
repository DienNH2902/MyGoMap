import { NextResponse } from "next/server";

/**
 * Proxy DÙNG CHUNG cho mọi loại tìm kiếm địa điểm/POI bằng TomTom Search API
 * (thay cho Nominatim + Overpass trước đây, vì dữ liệu POI của TomTom là cơ
 * sở dữ liệu RIÊNG của họ — không phụ thuộc vào OpenStreetMap, nên không bị
 * tình trạng thiếu/cũ dữ liệu như OSM). Dùng chung 1 route cho 3 nhu cầu:
 *
 * 1. Tìm địa chỉ tự do (searchPlaces trong nominatim.ts) — chỉ truyền `query`
 *    (+ lat/lon của người dùng để TomTom ưu tiên kết quả gần họ).
 * 2. Tìm POI quanh một điểm (findPoisAroundPoint) — truyền `query` = tên
 *    danh mục (vd "Trạm xăng") + lat/lon + radiusMeters của điểm đó.
 * 3. Tìm POI quanh từng điểm dừng khi lập lộ trình (findPoisForStops) — gọi
 *    lặp lại route này cho từng cặp (điểm dừng, danh mục).
 *
 * Giữ key ở server (không lộ ra client) và tránh lỗi CORS khi gọi thẳng từ
 * trình duyệt, giống hệt cách /api/tomtom/route đã làm cho routing.
 */

interface TomTomSearchRequest {
  query: string;
  lat?: number;
  lon?: number;
  radiusMeters?: number;
  limit?: number;
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
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing TOMTOM_API_KEY" },
      { status: 500 },
    );
  }

  const body = (await request.json()) as TomTomSearchRequest;
  const query = body.query?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const url = new URL(
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json`,
  );

  url.searchParams.set("key", apiKey);
  // Mặc định giới hạn trong Việt Nam — người dùng có thể ghi đè nếu sau này
  // cần tìm ở nước khác, nhưng toàn bộ app hiện tại chỉ phục vụ VN.
  url.searchParams.set("countrySet", body.countrySet ?? "VN");
  url.searchParams.set("limit", String(body.limit ?? 10));
  url.searchParams.set("language", "vi-VN");
  if (body.entityTypeSet) {
    url.searchParams.set("entityTypeSet", body.entityTypeSet);
  }

  // Ưu tiên/giới hạn kết quả quanh một toạ độ — dùng cho cả 2 trường hợp:
  // ưu tiên gần người dùng (searchPlaces) và tìm POI quanh 1 điểm cụ thể
  // (findPoisAroundPoint/findPoisForStops).
  if (typeof body.lat === "number" && typeof body.lon === "number") {
    url.searchParams.set("lat", String(body.lat));
    url.searchParams.set("lon", String(body.lon));
  }

  if (typeof body.radiusMeters === "number" && body.radiusMeters > 0) {
    url.searchParams.set("radius", String(Math.round(body.radiusMeters)));
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Không gọi được TomTom Search: ${String(err)}` },
      { status: 502 },
    );
  }

  const data = (await response
    .json()
    .catch(() => null)) as TomTomSearchResponse | null;

  if (!response.ok || !data) {
    return NextResponse.json(
      {
        error:
          data?.error?.description ?? `TomTom search error ${response.status}`,
      },
      { status: response.status === 200 ? 502 : response.status },
    );
  }

  const results: TomTomSearchApiResult[] = (data.results ?? [])
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

  return NextResponse.json({ results });
}
