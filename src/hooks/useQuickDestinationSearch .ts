"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reverseGeocode } from "@/lib/geocoding/nominatim";
import type { UseRoutePlannerReturn } from "./useRoutePlanner";
import type { PlaceResult } from "@/lib/types";

interface UseQuickDestinationSearchOptions {
  planner: UseRoutePlannerReturn;
}

/**
 * Chế độ tìm đường "nhanh" ở màn hình chính: KHÔNG có điểm xuất phát (A) để
 * chọn — điểm xuất phát luôn là vị trí GPS hiện tại của người dùng. Người
 * dùng chỉ cần gõ nơi muốn đến (B); sau khi chọn xong, UI sẽ tự thay ô input
 * bằng bảng tóm tắt "Vị trí hiện tại - Nơi đến" và lộ trình được tính luôn.
 *
 * Hook này chỉ lo phần lấy GPS làm điểm A + chuyển trạng thái input -> table.
 * Toàn bộ việc tính lộ trình, số liệu, vẽ bản đồ, "Chỉ đường"... vẫn dùng
 * nguyên `useRoutePlanner` như cũ, không đổi gì cả.
 */
export function useQuickDestinationSearch({
  planner,
}: UseQuickDestinationSearchOptions) {
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // true = đã chọn xong điểm đến -> hiển thị bảng "Vị trí hiện tại - Nơi đến"
  const [hasSearched, setHasSearched] = useState(false);
  // Đánh dấu "vừa set xong start & end từ quick-search, chờ state cập nhật
  // rồi gọi planTrip()" — không thể gọi planTrip() ngay sau setStart/setEnd
  // vì đó là state bất đồng bộ, planTrip() gọi ngay sẽ dùng dữ liệu cũ.
  const shouldPlanRef = useRef(false);

  const getCurrentLocationPlace = useCallback((): Promise<PlaceResult> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Trình duyệt không hỗ trợ định vị GPS."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const address = await reverseGeocode(latitude, longitude).catch(
            () => null,
          );

          resolve({
            id: "current-location",
            label: address
              ? `Vị trí hiện tại (${address.split(",")[0]})`
              : `Vị trí hiện tại (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            lat: latitude,
            lon: longitude,
          });
        },
        () =>
          reject(
            new Error(
              "Không lấy được vị trí GPS. Vui lòng cấp quyền định vị cho trình duyệt.",
            ),
          ),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  }, []);

  /** Người dùng chọn xong nơi muốn đến từ ô search — tự lấy GPS làm A rồi tính đường. */
  const selectDestination = useCallback(
    async (destination: PlaceResult) => {
      setLocationError(null);
      setIsLocating(true);
      planner.setEnd(destination);

      try {
        const currentLocation = await getCurrentLocationPlace();
        planner.setStart(currentLocation);
        shouldPlanRef.current = true;
        setHasSearched(true);
      } catch (err) {
        setLocationError(
          err instanceof Error
            ? err.message
            : "Không lấy được vị trí hiện tại.",
        );
        planner.setEnd(null);
      } finally {
        setIsLocating(false);
      }
    },
    [planner, getCurrentLocationPlace],
  );

  // Chờ planner.start & planner.end (đã set ở trên) thực sự cập nhật xong
  // rồi mới gọi planTrip() — tránh dùng closure cũ của planner.
  useEffect(() => {
    if (shouldPlanRef.current && planner.start && planner.end) {
      shouldPlanRef.current = false;
      void planner.planTrip();
    }
  }, [planner, planner.start, planner.end]);

  /** Quay lại ô tìm kiếm ban đầu, xoá lộ trình hiện có để tìm điểm đến khác. */
  const resetSearch = useCallback(() => {
    setHasSearched(false);
    setLocationError(null);
    planner.reset();
  }, [planner]);

  return {
    hasSearched,
    isLocating,
    locationError,
    selectDestination,
    resetSearch,
  };
}

export type UseQuickDestinationSearchReturn = ReturnType<
  typeof useQuickDestinationSearch
>;
