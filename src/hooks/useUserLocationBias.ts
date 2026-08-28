"use client";

import { useEffect, useState } from "react";
import type { UserLocationBias } from "@/lib/geocoding/nominatim";

/**
 * Lấy vị trí GPS hiện tại của người dùng một lần (âm thầm, không alert lỗi)
 * để dùng làm điểm tham chiếu "ưu tiên gợi ý gần tôi" khi tìm kiếm địa điểm.
 *
 * Khác với `fetchCurrentLocation` trong RoutePlannerPanel (dùng khi người dùng
 * bấm nút "Vị trí hiện tại" để CHỌN nó làm điểm đi/đến), hook này chỉ đọc toạ
 * độ trong nền để bias thứ tự kết quả — không hiển thị loading, không set làm
 * điểm đi/đến, và không báo lỗi nếu người dùng từ chối cấp quyền (im lặng bỏ
 * qua, quay về hành vi tìm kiếm mặc định như trước).
 */
export function useUserLocationBias(): UserLocationBias | null {
  const [location, setLocation] = useState<UserLocationBias | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      () => {
        // Từ chối quyền / timeout / lỗi khác: bỏ qua, kết quả tìm kiếm sẽ
        // không được ưu tiên theo vị trí nhưng vẫn hoạt động bình thường.
      },
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 5 * 60 * 1000, // Cache 5 phút, tránh xin quyền/định vị liên tục.
      },
    );
  }, []);

  return location;
}
