"use client";

import { EnrichedPoiInfo } from "@/hooks/usePoiEnrichment";
import { POI_CATEGORIES } from "@/lib/constants";
import type { PoiResult } from "@/lib/types";

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

  return (
    <div className="pointer-events-auto absolute left-[390px] top-1/3 z-40 w-[300px] -translate-y-1/2 overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl">
      <div className="relative h-36 w-full bg-surface-muted">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={poi.name}
            className="h-full w-full object-cover"
            onError={onImageError}
          />
        ) : isLookingUpImage ? (
          <div className="flex h-full w-full animate-pulse items-center justify-center bg-surface-muted text-xs text-ink/30">
            Đang tìm ảnh…
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-surface-muted text-4xl">
            {categoryIcon(poi.category)}
            <span className="text-[11px] italic text-ink/30">
              Chưa có ảnh cho địa điểm này
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-ink/60 shadow-md transition hover:bg-white hover:text-ink"
          aria-label="Đóng"
        >
          ✕
        </button>

        <span
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-white shadow-md"
          style={{ backgroundColor: categoryColor(poi.category) }}
        >
          <span>{categoryIcon(poi.category)}</span>
          {categoryLabel(poi.category)}
        </span>
      </div>

      <div className="px-4 py-3">
        {typeof stopOrder === "number" && (
          <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/40">
            Gần điểm dừng {stopOrder}
          </p>
        )}
        <p className="text-sm font-semibold leading-snug text-ink">
          {poi.name}
        </p>

        {address ? (
          <p className="mt-1.5 text-xs leading-relaxed text-ink/60">
            {address}
          </p>
        ) : isLookingUpAddress ? (
          <p className="mt-1.5 text-xs italic text-ink/30">Đang tìm địa chỉ…</p>
        ) : (
          <p className="mt-1.5 text-xs italic text-ink/30">Chưa rõ địa chỉ</p>
        )}

        <p className="mt-2 font-mono text-xs font-medium text-primary">
          Cách điểm dừng ~{poi.distanceFromStopKm.toFixed(1)} km
        </p>
      </div>
    </div>
  );
}
