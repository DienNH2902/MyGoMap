import { NextResponse } from "next/server";
import { OVERPASS_INTERPRETER_URL } from "@/lib/constants";

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    const response = await fetch(OVERPASS_INTERPRETER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "MyGoMap/1.0 (contact@mygomap.com)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Overpass API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch from Overpass API" },
      { status: 500 },
    );
  }
}
