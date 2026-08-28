"use client";

interface NavigationControlsProps {
  isNavigating: boolean;
  distanceToDestination: number | null; // km
  estimatedTimeRemaining: number | null; // phút
  isOffRoute: boolean;
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

export function NavigationControls({
  isNavigating,
  distanceToDestination,
  estimatedTimeRemaining,
  isOffRoute,
  onStartNavigation,
  onStopNavigation,
  onFollowUserLocation,
  isFollowing,
}: NavigationControlsProps) {
  if (isNavigating) {
    return (
      <div className="pointer-events-auto absolute bottom-4 left-1/2 z-10 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex flex-col items-center gap-2">
        {/* Nút Về giữa được căn giữa bằng self-center */}
        {isNavigating && !isFollowing && (
          <button
            type="button"
            onClick={onFollowUserLocation}
            className="flex items-center gap-2 rounded-full bg-ink/80 px-4 py-2 text-md font-bold text-green-500 shadow-xl transition hover:scale-105 active:scale-95 self-start backdrop-blur-3xl"
            aria-label="Về giữa"
          >
            {/* <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4.5 w-4.5 text-primary"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <circle cx="12" cy="12" r="3" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2v3M12 19v3M2 12h3M19 12h3"
              />
            </svg> */}

            <span>Về giữa</span>
          </button>
        )}

        {/* Cảnh báo lệch đường (nếu có) */}
        {/* {isOffRoute && (
          <div className="w-full rounded-xl bg-red-500/90 px-3 py-1.5 text-center shadow-lg backdrop-blur-md">
            <p className="text-xs font-semibold text-white">
              ⚠️ Bạn đang đi chệch tuyến đường!
            </p>
          </div>
        )} */}

        {/* Thanh Navigation thu gọn 1 hàng ngang */}
        <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-ink/85 p-3 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-3 pl-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-cream/50">
                Còn lại
              </p>
              {distanceToDestination !== null ? (
                <p className="font-mono text-xl font-bold leading-none text-primary">
                  {distanceToDestination.toFixed(1)}{" "}
                  <span className="text-xs">km</span>
                </p>
              ) : (
                <p className="animate-pulse text-xs font-medium text-cream/40">
                  Đang tính...
                </p>
              )}
            </div>

            <div className="h-7 w-[1px] bg-ink/10" />

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

          {/* Nút Thoát */}
          <button
            type="button"
            onClick={onStopNavigation}
            className="flex h-10 items-center gap-1.5 rounded-xl bg-red-500 px-4 text-xs font-semibold text-white shadow-md transition hover:bg-red-600 active:scale-95 shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
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
            Thoát
          </button>
        </div>
      </div>
    );
  }

  // Nút "Bắt đầu chỉ đường" khi chưa bật Navigation
  return (
    <div className="pointer-events-auto absolute bottom-32 left-1/2 z-0 -translate-x-1/2">
      <button
        type="button"
        onClick={onStartNavigation}
        className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-xl transition hover:opacity-90 active:scale-95"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
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
        Chỉ đường
      </button>
    </div>
  );
}
