"use client";

import { useEffect, useState } from "react";
import { POI_CATEGORIES } from "@/lib/constants";
import {
  findPoisAroundPoint,
  type AroundSearchInput,
} from "@/lib/overpass/overpassClient";
import type { PlaceResult, PoiCategoryId, PoiResult } from "@/lib/types";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";

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

  const selectedCategory =
    POI_CATEGORIES.find((category) => category.id === categoryId) ??
    POI_CATEGORIES[0];

  useEffect(() => {
    onResultsChange([]);
    onSelectPoi(null);
    setWarning(null);
  }, [center.id, onResultsChange, onSelectPoi]);

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
    <div className="pointer-events-auto absolute left-4 top-80 z-0 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            Tìm kiếm xung quanh
          </p>
          <p className="mt-1 truncate text-xs text-ink/55">{center.label}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink/45 transition hover:bg-ink/5 hover:text-ink"
          aria-label="Đóng tìm kiếm xung quanh"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink/45">
              Phạm vi
            </span>
            <select
              value={radiusMeters}
              onChange={(event) => setRadiusMeters(Number(event.target.value))}
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {RADIUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink/45">
              Danh mục
            </span>
            <select
              value={categoryId}
              onChange={(event) =>
                setCategoryId(event.target.value as PoiCategoryId)
              }
              className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            <LoadingSpinner label="Đang tìm…" />
          ) : (
            <p className="text-xs text-ink/45">
              {results.length > 0 ? `${results.length} kết quả` : "Chưa tìm"}
            </p>
          )}

          <Button
            variant="primary"
            type="button"
            disabled={isLoading}
            onClick={() => void handleSearch()}
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
          <div className="max-h-52 divide-y divide-ink/5 overflow-y-auto rounded-xl border border-ink/10">
            {results.map((poi) => (
              <button
                key={poi.id}
                type="button"
                onClick={() => onSelectPoi(poi.id)}
                className="block w-full px-3 py-2.5 text-left transition hover:bg-primary/5"
              >
                <p className="truncate text-sm font-semibold text-ink">
                  {poi.name}
                </p>
                <p className="mt-0.5 text-xs text-ink/50">
                  Cách điểm chọn ~{poi.distanceFromStopKm.toFixed(1)} km
                </p>
                {poi.address && (
                  <p className="mt-1 line-clamp-2 text-xs text-ink/45">
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
