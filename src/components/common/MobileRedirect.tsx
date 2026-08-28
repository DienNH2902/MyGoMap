"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function MobileRedirect() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Nếu đã ở trang /map rồi thì không chuyển hướng nữa
    if (pathname === "/map") return;

    // Kiểm tra nếu là thiết bị mobile (màn hình < 768px)
    const isMobile = window.matchMedia("(max-width: 767px)").matches;

    if (isMobile) {
      router.replace("/map");
    }
  }, [pathname, router]);

  return null;
}
