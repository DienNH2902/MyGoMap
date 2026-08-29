import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const APP_USER_AGENT = "MyGoMap/1.0 (https://your-domain.com)";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const url = new URL(
    "/api/geocoding/nominatim/search",
    window.location.origin,
  );

  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "vn");
  url.searchParams.set("accept-language", "vi");
  url.searchParams.set("addressdetails", "1");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": APP_USER_AGENT,
        Referer: "https://your-domain.com/",
      },

      // Cache phía Next/server
      next: {
        revalidate: 60,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "Nominatim request failed",
        },
        {
          status: response.status,
        },
      );
    }

    const data = await response.json();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Nominatim proxy error:", error);

    return NextResponse.json(
      {
        error: "Không thể kết nối tới Nominatim.",
      },
      {
        status: 502,
      },
    );
  }
}
