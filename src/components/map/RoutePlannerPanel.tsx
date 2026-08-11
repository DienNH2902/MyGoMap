"use client";

import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import { CategoryChips } from "./CategoryChips";
import { NumberStepper } from "../ui/NumberStepper";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import type { UseRoutePlannerReturn } from "@/hooks/useRoutePlanner";

interface RoutePlannerPanelProps {
  planner: UseRoutePlannerReturn;
}

export interface PoiCategoryDefinition {
  id: string;
  label: string;
  icon: string;
  osmKey: string;
  osmValue: string;
  color: string;
}

/** Danh sách các loại địa điểm gợi ý */
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

/**
 * Bottom control panel — the main way the user drives the app: search for an
 * origin and a destination, choose how many stops to make, pick which kinds
 * of places to look for, then start the trip or reset everything.
 */
export function RoutePlannerPanel({ planner }: RoutePlannerPanelProps) {
  const canPlan = Boolean(planner.start && planner.end) && !planner.isLoading;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-4">
      {/* Khối hiển thị chú thích màu sắc (Color Legend) */}
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

      {/* Panel điều khiển chính */}
      <div className="w-full max-w-4xl rounded-3xl border border-ink/10 bg-white/95 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <PlaceAutocompleteInput
            label="Điểm xuất phát"
            placeholder="Nhập địa điểm bắt đầu…"
            value={planner.start}
            onSelect={planner.setStart}
          />
          <PlaceAutocompleteInput
            label="Điểm kết thúc"
            placeholder="Tìm nơi cần đến…"
            value={planner.end}
            onSelect={planner.setEnd}
          />
          <NumberStepper
            label="Số điểm dừng"
            value={planner.stopCount}
            onChange={planner.setStopCount}
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
    </div>
  );
}
