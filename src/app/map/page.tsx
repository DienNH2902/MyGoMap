"use client";

import { useEffect, useState } from "react";
import { MapExperience } from "@/components/map/MapExperience";
import { OwlLoadingSpinner } from "@/components/ui/OwlLoadingSpinner";
import { CatBlock } from "@/components/ui/CatBlock";

function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;

  return window.matchMedia("(max-width: 767px)").matches;
}

// Khóa lưu trữ thông tin trong localStorage
const STORAGE_KEY_USER_NAME = "mygomap_user_name";
const STORAGE_KEY_USER_GENDER = "mygomap_user_gender";

export default function MapPage() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    // Kiểm tra xem có phải mobile không
    const mobileCheck = isMobileDevice();
    setIsMobile(mobileCheck);

    // Nếu là Mobile -> Cho phép truy cập thẳng, không cần check localStorage
    if (mobileCheck) {
      setIsAuthorized(true);
      return;
    }

    // Nếu là Desktop -> Kiểm tra thông tin người dùng trong localStorage
    const savedName = localStorage.getItem(STORAGE_KEY_USER_NAME);
    const savedGender = localStorage.getItem(STORAGE_KEY_USER_GENDER);

    if (!savedName || !savedName.trim() || !savedGender) {
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }
  }, []);

  // 1. Trong lúc chờ kiểm tra thông tin (chỉ trên desktop)
  if (isAuthorized === null && !isMobile) {
    return (
      <main className="flex h-dvh w-full items-center justify-center bg-surface">
        <OwlLoadingSpinner label="Đang kiểm tra thông tin người dùng..." />
      </main>
    );
  }

  // 2. Không đủ điều kiện truy cập (chỉ áp dụng cho desktop)
  if (!isAuthorized && !isMobile) {
    return (
      <main className="flex h-dvh w-full items-center justify-center bg-surface">
        <CatBlock />
      </main>
    );
  }

  // 3. Cho phép truy cập MapExperience (Mobile hoặc Desktop hợp lệ)
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-surface">
      <MapExperience />
    </main>
  );
}
