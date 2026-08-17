import { NextResponse } from "next/server";

interface TrafficTileParams {
  params: {
    z: string;
    x: string;
    y: string;
  };
}

const TRANSPARENT_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function transparentPngResponse() {
  const image = Buffer.from(TRANSPARENT_PNG_BASE64, "base64");

  return new NextResponse(image, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}

function isThicknessSupported(style: string) {
  return [
    "absolute",
    "relative",
    "relative-delay",
    "reduced-sensitivity",
  ].includes(style);
}

export async function GET(request: Request, { params }: TrafficTileParams) {
  const apiKey = process.env.TOMTOM_API_KEY;

  if (!apiKey) {
    console.warn("[Traffic] Missing TOMTOM_API_KEY");
    return transparentPngResponse();
  }

  const { searchParams } = new URL(request.url);
  const style = searchParams.get("style") ?? "relative0";
  const tileSize = searchParams.get("tileSize") ?? "256";

  const tomTomUrl = new URL(
    `https://api.tomtom.com/traffic/map/4/tile/flow/${style}/${params.z}/${params.x}/${params.y}.png`,
  );

  tomTomUrl.searchParams.set("key", apiKey);
  tomTomUrl.searchParams.set("tileSize", tileSize);

  // TomTom không hỗ trợ thickness cho relative0 / relative0-dark.
  if (isThicknessSupported(style)) {
    tomTomUrl.searchParams.set("thickness", "12");
  }

  const response = await fetch(tomTomUrl.toString(), {
    headers: {
      Accept: "image/png,application/json",
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn(
      `[Traffic] TomTom tile ${response.status} z=${params.z} x=${params.x} y=${params.y} style=${style}: ${body}`,
    );

    // Raster source cần image. Trả PNG trong suốt để map không spam lỗi tile.
    return transparentPngResponse();
  }

  const image = await response.arrayBuffer();

  return new NextResponse(image, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}
