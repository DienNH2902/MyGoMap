"use client";

import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import { CategoryChips } from "./CategoryChips";
import { VehicleModeToggle } from "./VehicleModeToggle";
import { NumberStepper } from "../ui/NumberStepper";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import type { UseRoutePlannerReturn } from "@/hooks/useRoutePlanner";
import { useState } from "react";

interface RoutePlannerPanelProps {
  planner: UseRoutePlannerReturn;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export interface PoiCategoryDefinition {
  id: string;
  label: string;
  icon: string;
  osmKey: string;
  osmValue: string;
  color: string;
}

export const POI_CATEGORIES: PoiCategoryDefinition[] = [
  {
    id: "fuel",
    label: "Trạm xăng",
    icon: "⛽",
    osmKey: "amenity",
    osmValue: "fuel",
    color: "#EF4444",
  },
  {
    id: "rest_area",
    label: "Trạm dừng chân",
    icon: "🛣️",
    osmKey: "highway",
    osmValue: "rest_area",
    color: "#8B5CF6",
  },
  {
    id: "restaurant",
    label: "Quán ăn",
    icon: "🍜",
    osmKey: "amenity",
    osmValue: "restaurant",
    color: "#F59E0B",
  },
  {
    id: "cafe",
    label: "Cà phê",
    icon: "☕",
    osmKey: "amenity",
    osmValue: "cafe",
    color: "#78350F",
  },
  {
    id: "hotel",
    label: "Khách sạn",
    icon: "🛏️",
    osmKey: "tourism",
    osmValue: "hotel",
    color: "#0EA5E9",
  },
  {
    id: "atm",
    label: "ATM",
    icon: "🏧",
    osmKey: "amenity",
    osmValue: "atm",
    color: "#10B981",
  },
  {
    id: "convenience",
    label: "Cửa hàng tiện lợi",
    icon: "🏪",
    osmKey: "shop",
    osmValue: "convenience",
    color: "#EC4899",
  },
];

export function RoutePlannerPanel({
  planner,
  isCollapsed = false,
  onToggleCollapse,
}: RoutePlannerPanelProps) {
  const [isLocatingStart, setIsLocatingStart] = useState(false);
  const [isLocatingEnd, setIsLocatingEnd] = useState(false);

  const canPlan = Boolean(planner.start && planner.end) && !planner.isLoading;

  const fetchCurrentLocation = (target: "start" | "end") => {
    if (!navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }

    if (target === "start") setIsLocatingStart(true);
    else setIsLocatingEnd(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
          );
          const data = await res.json();
          const label = data.display_name || "Vị trí hiện tại của bạn";

          const placeResult = {
            id: `current-location-${target}`,
            label: `Vị trí hiện tại (${label.split(",")[0]})`,
            lat: latitude,
            lon: longitude,
          };

          if (target === "start") planner.setStart(placeResult);
          else planner.setEnd(placeResult);
        } catch {
          const placeResult = {
            id: `current-location-${target}`,
            label: `Vị trí hiện tại (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`,
            lat: latitude,
            lon: longitude,
          };

          if (target === "start") planner.setStart(placeResult);
          else planner.setEnd(placeResult);
        } finally {
          if (target === "start") setIsLocatingStart(false);
          else setIsLocatingEnd(false);
        }
      },
      (error) => {
        if (target === "start") setIsLocatingStart(false);
        else setIsLocatingEnd(false);

        let msg = "Không thể lấy vị trí hiện tại.";
        if (error.code === error.TIMEOUT)
          msg = "Quá thời gian lấy định vị GPS.";
        if (error.code === error.PERMISSION_DENIED)
          msg = "Bạn đã từ chối cấp quyền vị trí.";
        alert(msg);
      },
      {
        enableHighAccuracy: false, // Tắt độ chính xác cao để ưu tiên phản hồi tức thì
        timeout: 10000, // Giới hạn 10s chờ
        maximumAge: 300000, // Sử dụng cache trong vòng 5 phút
      },
    );
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-4">
      {/* Nút bấm Đóng / Mở bảng điều khiển */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/95 px-4 py-1.5 text-xs font-semibold text-ink shadow-md backdrop-blur-md transition-all hover:bg-slate-50 active:scale-95"
        >
          <span>{isCollapsed ? "Mở bảng tìm đường" : "Thu gọn bảng"}</span>
          <svg
            className={`h-4 w-4 transition-transform duration-200 ${
              isCollapsed ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Nội dung bảng điều khiển (ẩn/hiện theo state isCollapsed) */}
      {!isCollapsed && (
        <>
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-ink/10 bg-white/90 px-4 py-1.5 shadow-sm backdrop-blur-md">
            <span className="text-xs font-medium text-slate-500">Chú thích:</span>
            {POI_CATEGORIES.map((category) => (
              <div
                key={category.id}
                className="flex items-center gap-1.5 px-1.5 py-0.5"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: category.color }}
                />
                <span className="text-xs text-slate-700">{category.label}</span>
              </div>
            ))}
          </div>

          <div className="w-full max-w-4xl rounded-3xl border border-ink/10 bg-white/95 p-5 shadow-2xl backdrop-blur-md transition-all">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <PlaceAutocompleteInput
                label="Điểm xuất phát"
                placeholder="Nhập địa điểm bắt đầu…"
                value={planner.start}
                onSelect={planner.setStart}
                onUseCurrentLocation={() => fetchCurrentLocation("start")}
                isLocating={isLocatingStart}
              />
              <PlaceAutocompleteInput
                label="Điểm kết thúc"
                placeholder="Tìm nơi cần đến…"
                value={planner.end}
                onSelect={planner.setEnd}
                onUseCurrentLocation={() => fetchCurrentLocation("end")}
                isLocating={isLocatingEnd}
              />
              <NumberStepper
                label="Số điểm dừng"
                value={planner.stopCount}
                onChange={planner.setStopCount}
              />
              <VehicleModeToggle
                label="Loại xe"
                avoidHighways={planner.avoidHighways}
                onChange={planner.setAvoidHighways}
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CategoryChips
                selected={planner.selectedCategories}
                onToggle={planner.toggleCategory}
              />

              <div className="flex items-center gap-2">
                {planner.isLoading && (
                  <LoadingSpinner label="Đang tính lộ trình…" />
                )}
                <Button
                  variant="ghost"
                  type="button"
                  onClick={planner.reset}
                  className="border border-ink/10"
                >
                  Đặt lại
                </Button>
                <Button
                  variant="primary"
                  type="button"
                  disabled={!canPlan}
                  onClick={() => void planner.planTrip()}
                >
                  Bắt đầu
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
