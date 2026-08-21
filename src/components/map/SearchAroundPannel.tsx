"use client";

import { useEffect, useState } from "react";
import { POI_CATEGORIES } from "@/lib/constants";
import {
  findPoisAroundPoint,
  type AroundSearchInput,
} from "@/lib/overpass/overpassClient";
import type { PlaceResult, PoiCategoryId, PoiResult } from "@/lib/types";
import { Button } from "../ui/Button";
import { CircleLoadingSpinner } from "../ui/CircleLoadingSpinner";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

const RADIUS_OPTIONS = [
  { label: "50m", value: 50 },
  { label: "1km", value: 1000 },
  { label: "2km", value: 2000 },
  { label: "5km", value: 5000 },
  { label: "10km", value: 10000 },
];

interface AroundSearchPanelProps {
  center: PlaceResult;
  results: PoiResult[];
  onResultsChange: (pois: PoiResult[]) => void;
  onSelectPoi: (poiId: string | null) => void;
  onClose: () => void;
}

export function AroundSearchPanel({
  center,
  results,
  onResultsChange,
  onSelectPoi,
  onClose,
}: AroundSearchPanelProps) {
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [categoryId, setCategoryId] = useState<PoiCategoryId>("fuel");
  const [isLoading, setIsLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const selectedCategory =
    POI_CATEGORIES.find((category) => category.id === categoryId) ??
    POI_CATEGORIES[0];

  useEffect(() => {
    onResultsChange([]);
    onSelectPoi(null);
    setWarning(null);
  }, [center.id, onResultsChange, onSelectPoi]);

  // Style màu chữ cho tiêu đề dựa trên giới tính
  const getTitleColorClass = () => {
    if (gender === "nu") return "text-pink-500";
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 bg-clip-text text-transparent";
    }
    return "text-primary";
  };

  // Style màu nền & hover cho nút "Tìm kiếm" dựa trên giới tính
  const getButtonClass = () => {
    if (gender === "nu") {
      return "bg-pink-500 hover:bg-pink-600 text-white border-none";
    }
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 hover:opacity-95 text-white border-none";
    }
    return ""; // Giữ style mặc định của Button variant="primary"
  };

  // Style hover cho từng item trong danh sách kết quả
  const getItemHoverClass = () => {
    if (gender === "nu") return "hover:bg-pink-500/20 text-pink-300";
    if (gender === "khac") return "hover:bg-purple-500/20 text-purple-300";
    return "hover:bg-white/10 text-cream";
  };

  const handleSearch = async () => {
    if (!selectedCategory) return;

    const controller = new AbortController();
    setIsLoading(true);
    setWarning(null);

    const input: AroundSearchInput = {
      center,
      radiusMeters,
      category: selectedCategory,
      signal: controller.signal,
    };

    const { pois, fetchFailed } = await findPoisAroundPoint(input);

    setIsLoading(false);
    onResultsChange(pois);

    if (fetchFailed) {
      setWarning("Không thể tải dữ liệu địa điểm lúc này. Hãy thử lại sau.");
      return;
    }

    if (pois.length === 0) {
      setWarning("Không tìm thấy địa điểm phù hợp trong phạm vi đã chọn.");
    }
  };

  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-40 mx-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-ink/85 p-2 shadow-xl backdrop-blur-md transition-all sm:left-4 sm:top-[330px] sm:bottom-auto sm:right-auto sm:mx-0 sm:w-[22rem] sm:max-w-none">
      {/* Thanh kéo tay nắm (Drag Indicator) cho thiết bị Mobile */}
      {/* <div className="flex justify-center pt-2 pb-1 sm:hidden">
        <div className="h-1.5 w-12 rounded-full bg-ink/20" />
      </div> */}

      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <p
            className={`text-[10px] font-bold uppercase tracking-wide ${getTitleColorClass()}`}
          >
            Tìm kiếm xung quanh
          </p>
          <p className="mt-0.5 truncate text-xs text-cream/70">
            {center.label}
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-cream/60 transition hover:bg-white/10 hover:text-cream active:scale-95"
          aria-label="Đóng tìm kiếm xung quanh"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-cream/50">
              Phạm vi
            </span>
            <select
              value={radiusMeters}
              onChange={(event) => setRadiusMeters(Number(event.target.value))}
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-cream focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [&>option]:bg-ink [&>option]:text-cream"
            >
              {RADIUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-cream/50">
              Danh mục
            </span>
            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(event.target.value as PoiCategoryId)
              }
              className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-cream focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [&>option]:bg-ink [&>option]:text-cream"
            >
              {POI_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          {isLoading ? (
            <CircleLoadingSpinner label="Đang tìm xung quanh…" />
          ) : (
            <p className="text-xs text-cream/50">
              {results.length > 0 ? `${results.length} kết quả` : "Chưa tìm"}
            </p>
          )}

          <Button
            variant="primary"
            type="button"
            disabled={isLoading}
            onClick={() => void handleSearch()}
            className={getButtonClass()}
          >
            Tìm kiếm
          </Button>
        </div>

        {warning && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {warning}
          </p>
        )}

        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto divide-y divide-white/10 rounded-xl border border-white/10 sm:max-h-52">
            {results.map((poi) => (
              <button
                key={poi.id}
                type="button"
                onClick={() => onSelectPoi(poi.id)}
                className={`block w-full px-3 py-2.5 text-left transition touch-manipulation active:bg-white/10 ${getItemHoverClass()}`}
              >
                <p className="truncate text-sm font-semibold text-cream">
                  {poi.name}
                </p>
                <p className="mt-0.5 text-xs text-cream/60">
                  Cách điểm chọn ~{poi.distanceFromStopKm.toFixed(1)} km
                </p>
                {poi.address && (
                  <p className="mt-1 line-clamp-2 text-xs text-cream/50">
                    {poi.address}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
