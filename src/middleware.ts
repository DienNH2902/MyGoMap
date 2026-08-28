import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";

  // Regex kiểm tra thiết bị di động (iPhone, Android, iPod, BlackBerry, Windows Phone...)
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent,
    );

  // Nếu truy cập trang chủ `/` trên mobile -> Redirect tức thì từ Server
  if (isMobile && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/map", request.url));
  }

  return NextResponse.next();
}

// Cấu hình matcher chỉ áp dụng cho trang chủ / để tránh ảnh hưởng tài nguyên tĩnh & API
export const config = {
  matcher: "/",
};
