"use client";

import { useRef } from "react";

interface NavigationControlsProps {
  isNavigating: boolean;
  distanceToDestination: number | null; // km
  estimatedTimeRemaining: number | null; // phút
  isOffRoute: boolean;
  /** true trong lúc đang gọi API tính lại lộ trình theo vị trí mới — xem useNavigationTracking. */
  isRerouting: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
  onFollowUserLocation: () => void;
  isFollowing: boolean;
}

/** Formats a minute count as "X giờ Y phút" or just "Y phút" when under an hour. */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours === 0 ? `${mins} phút` : `${hours}h ${mins}p`;
}

/**
 * Nút bấm dùng chung cho khu vực điều hướng — xử lý sự kiện ở CẢ onClick lẫn
 * onTouchEnd (bắn thẳng, không qua độ trễ ~300ms trình duyệt dùng để phân
 * biệt tap thường với double-tap-zoom). Đây là fix cho lỗi phải bấm 2-3 lần
 * mới ăn trên mobile: nút nằm trong khối có backdrop-blur-xl, lần chạm đầu
 * tiên trên iOS Safari thường bị "nuốt" để trình duyệt dựng lớp compositing
 * cho hiệu ứng blur, chỉ lần chạm thứ 2 mới thực sự bắn ra click. Dùng
 * touchHandledRef để đảm bảo onTouchEnd + onClick không cùng gọi handler 2
 * lần khi cả hai sự kiện đều được trình duyệt bắn ra bình thường.
 */
function useReliableTap(handler: () => void) {
  const touchHandledRef = useRef(false);

  return {
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      touchHandledRef.current = true;
      handler();
      // Reset ngay sau 1 khung hình, để lần bấm kế tiếp (kể cả bằng chuột
      // trên desktop test) không bị chặn nhầm.
      requestAnimationFrame(() => {
        touchHandledRef.current = false;
      });
    },
    onClick: () => {
      if (touchHandledRef.current) return;
      handler();
    },
  };
}

export function NavigationControls({
  isNavigating,
  distanceToDestination,
  estimatedTimeRemaining,
  isOffRoute,
  isRerouting,
  onStartNavigation,
  onStopNavigation,
  onFollowUserLocation,
  isFollowing,
}: NavigationControlsProps) {
  const stopTapHandlers = useReliableTap(onStopNavigation);
  const followTapHandlers = useReliableTap(onFollowUserLocation);
  const startTapHandlers = useReliableTap(onStartNavigation);

  if (isNavigating) {
    return (
      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex flex-col items-center gap-2">
        {/* Nút Về giữa được căn giữa bằng self-center */}
        {isNavigating && !isFollowing && (
          <button
            type="button"
            {...followTapHandlers}
            className="touch-manipulation flex items-center gap-2 rounded-full bg-ink/80 px-4 py-2 text-xl font-bold text-green-500 shadow-xl transition hover:scale-105 active:scale-95 self-start backdrop-blur-3xl"
            style={{ WebkitTapHighlightColor: "transparent" }}
            aria-label="Về giữa"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
            <span>Về giữa</span>
          </button>
        )}

        {/* Cảnh báo lệch đường — 2 trạng thái: vừa lệch (đang đếm 3s để xác
            nhận không phải nhiễu GPS thoáng qua, xem OFFROUTE_CONFIRM_MS
            trong useNavigationTracking) và đang thực sự gọi API tính lại
            tuyến (isRerouting). */}
        {isOffRoute && !isRerouting && (
          <div className="flex w-full items-center gap-2 rounded-xl bg-red-500/90 px-3.5 py-2 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 shrink-0 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <p className="text-md font-semibold text-white">
              Bạn đang đi chệch tuyến đường! Cập nhật tuyến đường mới sau vài
              giây...
            </p>
          </div>
        )}

        {isRerouting && (
          <div className="flex w-full items-center gap-2 rounded-xl bg-amber-500/90 px-3.5 py-2 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 shrink-0 animate-spin text-white"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-90"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
              />
            </svg>
            <p className="text-md font-semibold text-white">
              Đang cập nhật tuyến đường mới...
            </p>
          </div>
        )}

        {/* Thanh Navigation thu gọn 1 hàng ngang */}
        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-ink/85 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-4 pl-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-cream/50">
                Còn lại
              </p>
              {distanceToDestination !== null ? (
                <p className="font-mono text-xl font-bold leading-none text-primary">
                  {distanceToDestination.toFixed(1)}
                  <span className="text-xs">km</span>
                </p>
              ) : (
                <p className="animate-pulse text-xs font-medium text-cream/40">
                  Đang tính...
                </p>
              )}
            </div>

            <div className="h-7 w-[3px] bg-gray-400" />

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-cream/50">
                Thời gian
              </p>
              {estimatedTimeRemaining !== null ? (
                <p className="text-xl font-semibold leading-none text-cream/90">
                  ~{formatDuration(estimatedTimeRemaining)}
                </p>
              ) : (
                <p className="animate-pulse text-xs text-cream/40">-- phút</p>
              )}
            </div>
          </div>

          {/* Nút Thoát — xem useReliableTap ở trên: xử lý ngay ở onTouchEnd
              thay vì chỉ chờ onClick, fix lỗi phải bấm 2-3 lần mới ăn trên
              mobile (backdrop-blur-xl trên khối cha khiến lần chạm đầu tiên
              trên iOS Safari thường bị dùng để dựng lớp compositing thay vì
              bắn click). */}
          <button
            type="button"
            {...stopTapHandlers}
            className="touch-manipulation flex h-11 items-center gap-1.5 rounded-xl bg-red-500 px-4 text-2xl font-semibold text-white shadow-md transition hover:bg-red-600 active:scale-95 shrink-0"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            {/* Thoát */}
          </button>
        </div>
      </div>
    );
  }

  // Nút "Bắt đầu chỉ đường" — CHỈ HIỆN TRÊN MOBILE
  return (
    <div className="pointer-events-auto absolute bottom-20 left-12 z-0 -translate-x-1/2 md:hidden">
      <button
        type="button"
        {...startTapHandlers}
        className="touch-manipulation flex items-center gap-1 border-4 border-orange-600 rounded-full bg-primary p-3 text-lg font-semibold text-white shadow-xl transition hover:opacity-90 active:scale-95"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
        {/* Đi */}
      </button>
    </div>
  );
}
