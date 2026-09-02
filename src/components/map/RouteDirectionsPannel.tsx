"use client";

import { useMemo, useState } from "react";
import type { RouteGeometry, RouteStep } from "@/lib/types";

interface RouteDirectionsPanelProps {
  /** Tuyến đang thực sự hiển thị trên bản đồ (displayRoute ở MapExperience) — dùng để lấy `steps`. */
  route: RouteGeometry | null;
  /**
   * Tổng quãng đường (km) của TUYẾN TĨNH đã lập lúc "Tìm đường". Cần truyền
   * riêng vì trong lúc đang dẫn đường, `route.distanceKm` của liveRoute chỉ
   * còn là quãng đường CÒN LẠI (xem buildTrimmedLiveRoute trong
   * useNavigationTracking.ts), không phải tổng ban đầu — nếu không có mốc
   * này thì không thể suy ra đã đi được bao nhiêu m để biết đang ở chặng nào.
   */
  plannedTotalDistanceKm: number | null;
  isNavigating: boolean;
  distanceToDestinationKm: number | null;
}

function formatStepDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters / 10) * 10} m`;
}

/**
 * Bảng chỉ dẫn rẽ từng chặng ("còn Xm thì rẽ trái/phải vào ABC") kiểu
 * Google Maps, dựng từ `route.steps` (xem RouteStep trong lib/types.ts,
 * được openRouteService.ts / route.ts TomTom điền sẵn).
 *
 * - Đang dẫn đường: hiện banner nổi ở đầu bản đồ, chỉ đúng MỘT chặng kế
 *   tiếp, tự cập nhật khoảng cách còn lại theo GPS.
 * - Chưa dẫn đường (mới lập tuyến): hiện nút mở toàn bộ danh sách chặng để
 *   xem trước, giống bảng chỉ đường khi chưa bấm "Bắt đầu" trên ggmap.
 */
export function RouteDirectionsPanel({
  route,
  plannedTotalDistanceKm,
  isNavigating,
  distanceToDestinationKm,
}: RouteDirectionsPanelProps) {
  const [isListOpen, setIsListOpen] = useState(false);

  const steps = route?.steps ?? [];

  // Mốc offset tích lũy (m tính từ điểm xuất phát) của từng chặng — dùng để
  // biết đã đi tới chặng thứ mấy rồi.
  const cumulativeOffsets = useMemo(() => {
    let total = 0;
    return steps.map((step) => {
      total += step.distanceMeters;
      return total;
    });
  }, [steps]);

  const distanceTraveledMeters =
    isNavigating &&
    plannedTotalDistanceKm != null &&
    distanceToDestinationKm != null
      ? Math.max(
          0,
          plannedTotalDistanceKm * 1000 - distanceToDestinationKm * 1000,
        )
      : 0;

  const currentStepIndex = isNavigating
    ? cumulativeOffsets.findIndex((offset) => offset > distanceTraveledMeters)
    : -1;

  const currentStep: RouteStep | null =
    currentStepIndex >= 0 ? (steps[currentStepIndex] ?? null) : null;

  const currentStepOffset =
    currentStepIndex >= 0
      ? (cumulativeOffsets[currentStepIndex] ?? null)
      : null;

  const remainingToTurnMeters =
    currentStep != null && currentStepOffset != null
      ? Math.max(0, currentStepOffset - distanceTraveledMeters)
      : null;

  const upcomingSteps =
    isNavigating && currentStepIndex >= 0
      ? steps.slice(currentStepIndex, currentStepIndex + 6)
      : [];

  if (steps.length === 0) return null;

  return (
    <>
      {/* Banner "còn Xm thì rẽ..." khi đang dẫn đường */}
      {isNavigating && currentStep && (
        <div
          className="pointer-events-auto fixed left-1/2 top-[calc(var(--header-h)+0.75rem)] z-50 w-[92%] max-w-md -translate-x-1/2"
          aria-live="polite"
        >
          <button
            type="button"
            onClick={() => setIsListOpen((prev) => !prev)}
            className="w-full rounded-2xl border border-accent-gold/30 bg-ink/90 px-4 py-3 text-left shadow-2xl backdrop-blur-md"
          >
            <div className="flex items-center gap-3">
              {/* <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-gold/15">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-accent-gold"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </div> */}
              <div className="min-w-0 flex-1">
                {remainingToTurnMeters != null && (
                  <div className="flex items-center gap-2">
                    <p className="text-[16px] font-semibold tracking-wide text-orange-500">
                      Đi tiếp
                    </p>
                    <p className="text-[20px] font-semibold tracking-wide text-accent-gold">
                      {formatStepDistance(remainingToTurnMeters)}
                    </p>
                  </div>
                )}
                <span className="text-white">------------</span>
                <p className="whitespace-normal break-words text-sm font-bold text-cream">
                  {currentStep.instruction}
                </p>
              </div>
            </div>
          </button>

          {isListOpen && (
            <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-2xl border border-white/20 bg-ink/95 shadow-2xl backdrop-blur-md">
              <ol className="divide-y divide-white/10">
                {upcomingSteps.map((step, index) => {
                  const actualIndex = currentStepIndex + index;

                  return (
                    <li
                      key={actualIndex}
                      className="flex items-start gap-2.5 px-3 py-3"
                    >
                      <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-gold/15 text-[11px] font-bold text-accent-gold">
                        {actualIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="whitespace-normal break-words text-sm leading-snug text-cream">
                          {step.instruction}
                        </p>
                        <p className="text-[11px] text-cream/50">
                          {formatStepDistance(step.distanceMeters)}
                          {step.streetName ? ` · ${step.streetName}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Bảng chỉ dẫn đầy đủ khi CHƯA dẫn đường — xem trước toàn bộ tuyến */}
      {!isNavigating && (
        <div className="pointer-events-auto absolute right-3 top-[calc(var(--header-h)+4rem)] z-30 hidden md:block">
          <button
            type="button"
            onClick={() => setIsListOpen((prev) => !prev)}
            className="rounded-2xl border border-white/20 bg-ink/85 px-3.5 py-2 text-sm font-bold text-cream shadow-xl backdrop-blur-md transition hover:bg-ink"
          >
            {isListOpen
              ? "Ẩn chỉ dẫn"
              : `Chỉ dẫn chi tiết (${steps.length} chặng)`}
          </button>

          {isListOpen && (
            <div className="mt-2 max-h-[50vh] w-80 overflow-y-auto rounded-2xl border border-white/20 bg-ink/95 p-3 shadow-2xl backdrop-blur-md">
              <ol className="space-y-2.5">
                {steps.map((step, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2.5 border-b border-white/10 pb-2.5 last:border-0 last:pb-0"
                  >
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-gold/15 text-[11px] font-bold text-accent-gold">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-snug text-cream">
                        {step.instruction}
                      </p>
                      <p className="text-[11px] text-cream/50">
                        {formatStepDistance(step.distanceMeters)}
                        {step.streetName ? ` · ${step.streetName}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </>
  );
}
