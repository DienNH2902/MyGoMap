"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { MapExperience } from "@/components/map/MapExperience";
import { OwlLoadingSpinner } from "@/components/ui/OwlLoadingSpinner";

// Khóa lưu trữ thông tin trong localStorage
const STORAGE_KEY_USER_NAME = "mygomap_user_name";
const STORAGE_KEY_USER_GENDER = "mygomap_user_gender";

export default function MapPage() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY_USER_NAME);
    const savedGender = localStorage.getItem(STORAGE_KEY_USER_GENDER);

    // Kiểm tra xem tên hoặc giới tính có bị thiếu / rỗng không
    if (!savedName || !savedName.trim() || !savedGender) {
      // Chuyển hướng về trang chủ nếu chưa điền đầy đủ
      router.replace("/");
    } else {
      // Đã có đầy đủ thông tin -> Cho phép xem bản đồ
      setIsAuthorized(true);
    }
  }, [router]);

  // Trong lúc chờ kiểm tra thông tin, hiển thị màn hình chờ bảo vệ
  if (!isAuthorized) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-surface">
        <OwlLoadingSpinner label="Đang kiểm tra thông tin người dùng..." />
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-surface">
      <Header />
      <MapExperience />
    </main>
  );
}
