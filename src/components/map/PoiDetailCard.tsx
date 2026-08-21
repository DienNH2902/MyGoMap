"use client";

import { useEffect, useState } from "react";
import { EnrichedPoiInfo } from "@/hooks/usePoiEnrichment";
import { POI_CATEGORIES } from "@/lib/constants";
import type { PoiResult } from "@/lib/types";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

function categoryLabel(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.label ??
    categoryId
  );
}

function categoryIcon(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.icon ?? "📍"
  );
}

function categoryColor(categoryId: string): string {
  return (
    POI_CATEGORIES.find((category) => category.id === categoryId)?.color ??
    "#FF6A1A"
  );
}

interface PoiDetailCardProps {
  poi: PoiResult;
  /** Order number of the parent stop, e.g. "Điểm dừng 1" — omitted if unknown. */
  stopOrder?: number;
  enriched: EnrichedPoiInfo;
  onImageError: () => void;
  onClose: () => void;
}

/**
 * Chi tiết đầy đủ của MỘT chấm POI duy nhất (Tên, danh mục, địa chỉ, ảnh,
 * khoảng cách tới điểm dừng) — hiện khi người dùng bấm vào chấm đó trên bản
 * đồ, hoặc bấm nút "Vị trí" ở sidebar bên phải. Khác với StopDetailDrawer
 * (liệt kê TẤT CẢ địa điểm quanh một điểm dừng), thẻ này chỉ nói về một
 * địa điểm đang được chọn.
 */
export function PoiDetailCard({
  poi,
  stopOrder,
  enriched,
  onImageError,
  onClose,
}: PoiDetailCardProps) {
  const { address, isLookingUpAddress, imageUrl, isLookingUpImage } = enriched;
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const getDistanceColor = () => {
    if (gender === "nu") return "text-pink-400";
    if (gender === "khac") return "text-purple-400";
    return "text-primary";
  };

  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-40 mx-auto max-h-[80vh] w-[calc(100%-2rem)] max-w-sm overflow-hidden rounded-3xl border border-ink/10 bg-ink/85 shadow-2xl backdrop-blur-md transition-all sm:left-[390px] sm:top-24 sm:bottom-auto sm:right-auto sm:mx-0 sm:w-[320px] sm:max-w-none sm:translate-y-0">
      {/* Thanh kéo tay nắm (Drag Indicator) cho thiết bị Mobile */}
      {/* <div className="flex justify-center pt-2 pb-1 sm:hidden">
        <div className="h-1.5 w-12 rounded-full bg-white/20" />
      </div> */}

      <div className="relative h-36 w-full bg-black/40 sm:h-40">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={poi.name}
            className="h-full w-full object-cover"
            onError={onImageError}
          />
        ) : isLookingUpImage ? (
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-black/30 text-xs text-cream/40">
            Đang tìm ảnh…
          </div>
        ) : (
          <div className="flex h-36 w-full flex-col items-center justify-center gap-1 bg-black/30 text-4xl sm:h-40">
            {categoryIcon(poi.category)}
            <span className="text-[11px] italic text-cream/40">
              Chưa có ảnh cho địa điểm này
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/60 text-cream/80 shadow-md backdrop-blur-sm transition hover:bg-black/80 hover:text-white active:scale-95"
          aria-label="Đóng"
        >
          ✕
        </button>

        <span
          className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-sm"
          style={{ backgroundColor: categoryColor(poi.category) }}
        >
          <span>{categoryIcon(poi.category)}</span>
          {categoryLabel(poi.category)}
        </span>
      </div>

      <div className="p-4">
        {typeof stopOrder === "number" && (
          <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-cream/50">
            Gần điểm dừng {stopOrder}
          </p>
        )}
        <p className="text-sm font-semibold leading-snug text-cream">
          {poi.name}
        </p>

        {address ? (
          <p className="mt-1.5 text-xs leading-relaxed text-cream/70">
            {address}
          </p>
        ) : isLookingUpAddress ? (
          <p className="mt-1.5 text-xs italic text-cream/40">
            Đang tìm địa chỉ…
          </p>
        ) : (
          <p className="mt-1.5 text-xs italic text-cream/40">Chưa rõ địa chỉ</p>
        )}

        <p
          className={`mt-2 font-mono text-xs font-semibold ${getDistanceColor()}`}
        >
          Cách điểm dừng ~{poi.distanceFromStopKm.toFixed(1)} km
        </p>
      </div>
    </div>
  );
}
