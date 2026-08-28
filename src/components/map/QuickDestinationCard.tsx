"use client";

import { PlaceAutocompleteInput } from "./PlaceAutocompleteInput";
import { Button } from "../ui/Button";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import type { UseRoutePlannerReturn } from "@/hooks/useRoutePlanner";
import { UseQuickDestinationSearchReturn } from "@/hooks/useQuickDestinationSearch ";
import { useUserLocationBias } from "@/hooks/useUserLocationBias";

interface QuickDestinationCardProps {
  planner: UseRoutePlannerReturn;
  quickSearch: UseQuickDestinationSearchReturn;
  isNavigating?: boolean;
  isPanelOpen?: boolean;
}

/**
 * Card tìm đường "nhanh" nổi ở đầu màn hình /map:
 * - Ban đầu: chỉ 1 ô input tìm "Nơi đến" (không có điểm A — mặc định là GPS).
 * - Sau khi chọn xong nơi đến: input được thay bằng bảng tóm tắt
 *   "Vị trí hiện tại - Nơi đến" + nút đổi lại điểm đến.
 */
export function QuickDestinationCard({
  planner,
  quickSearch,
  isNavigating = false,
  isPanelOpen = false,
}: QuickDestinationCardProps) {
  const userLocation = useUserLocationBias();

  if (isNavigating || isPanelOpen) return null;

  // Kiểm tra trạng thái đang tải (tìm GPS hoặc tính toán đường đi)
  const isLoading = planner.isLoading || quickSearch.isLocating;

  if (quickSearch.hasSearched && planner.start && planner.end) {
    return (
      <div className="pointer-events-auto absolute left-1/2 top-4 z-40 w-[92%] max-w-xl -translate-x-1/2 rounded-2xl border border-ink/10 bg-ink/90 p-3 shadow-xl backdrop-blur-md">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-accent-gold">
            {/* <LoadingSpinner /> */}
            <span>Đang tìm tuyến đường tối ưu...</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={quickSearch.resetSearch}
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-cream/70 transition-colors hover:bg-white/20 hover:text-cream focus:outline-none"
              aria-label="Đổi điểm đến"
              title="Đổi điểm đến"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="flex flex-col gap-3 py-1">
              {/* Điểm xuất phát */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex flex-col items-center">
                  <span className="ml-[1px] h-5 w-5 rounded-full border-2 border-emerald-400 bg-emerald-400/20" />

                  <svg
                    className="my-1 h-5 w-5 text-yellow-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-yellow-400">
                    Bắt đầu
                  </p>

                  <p className="truncate text-sm text-cream/90">
                    {planner.start.label}
                  </p>
                </div>
              </div>

              {/* Điểm đến */}
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex items-center justify-center">
                  <svg
                    className="h-6 w-6 text-blue-400"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-yellow-400">
                    Kết thúc
                  </p>

                  <p className="truncate text-sm text-cream/90">
                    {planner.end.label}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-4 z-40 w-[92%] max-w-md -translate-x-1/2 rounded-2xl border border-ink/10 bg-ink/80 p-1 shadow-xl backdrop-blur-md">
      <div className="relative flex items-center">
        <div className="w-full">
          <PlaceAutocompleteInput
            placeholder="Nhập nơi muốn đến…"
            value={null}
            onSelect={(place) => {
              if (place) void quickSearch.selectDestination(place);
            }}
            isLocating={quickSearch.isLocating}
            dropdownPlacement="bottom"
            userLocation={userLocation}
            hideFocusRing={true}
          />
        </div>

        {/* Indicator Loader nổi bên trong input khi đang xử lý */}
        {/* {isLoading && (
          <div className="absolute right-3 flex items-center gap-2 bg-ink/90 px-2 py-1 rounded-lg">
            <LoadingSpinner />
          </div>
        )} */}
      </div>

      {quickSearch.locationError && (
        <p className="px-3 pb-2 text-xs text-rose-300">
          {quickSearch.locationError}
        </p>
      )}
    </div>
  );
}
