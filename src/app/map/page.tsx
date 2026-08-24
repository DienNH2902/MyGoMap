"use client";

import { useEffect, useState } from "react";
import { MapExperience } from "@/components/map/MapExperience";
import { OwlLoadingSpinner } from "@/components/ui/OwlLoadingSpinner";
import { CatBlock } from "@/components/ui/CatBlock";

// Khóa lưu trữ thông tin trong localStorage
const STORAGE_KEY_USER_NAME = "mygomap_user_name";
const STORAGE_KEY_USER_GENDER = "mygomap_user_gender";

export default function MapPage() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY_USER_NAME);
    const savedGender = localStorage.getItem(STORAGE_KEY_USER_GENDER);

    if (!savedName || !savedName.trim() || !savedGender) {
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }
  }, []);

  // Trong lúc chờ kiểm tra thông tin, hiển thị màn hình chờ bảo vệ
  if (isAuthorized === null) {
    return (
      <main className="flex h-dvh w-full items-center justify-center bg-surface">
        <OwlLoadingSpinner label="Đang kiểm tra thông tin người dùng..." />
      </main>
    );
  }

  if (!isAuthorized) {
    return (
      <main className="flex h-dvh w-full items-center justify-center bg-surface">
        <CatBlock />
      </main>
    );
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-surface">
      <MapExperience />
    </main>
  );
}
