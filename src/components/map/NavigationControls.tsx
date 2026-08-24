"use client";

interface NavigationControlsProps {
  isNavigating: boolean;
  distanceToDestination: number | null; // km
  estimatedTimeRemaining: number | null; // phút
  isOffRoute: boolean;
  onStartNavigation: () => void;
  onStopNavigation: () => void;
}

export function NavigationControls({
  isNavigating,
  distanceToDestination,
  estimatedTimeRemaining,
  isOffRoute,
  onStartNavigation,
  onStopNavigation,
}: NavigationControlsProps) {
  if (isNavigating) {
    return (
      <div className="pointer-events-auto absolute bottom-32 left-1/2 z-0 flex -translate-x-1/2 flex-col items-center gap-3">
        {/* Thông tin navigation */}
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-ink/10 bg-white/95 px-6 py-4 shadow-2xl backdrop-blur-md min-w-[200px]">
          {isOffRoute && (
            <div className="mb-1 rounded-lg bg-red-50 px-3 py-1.5 text-center">
              <p className="text-xs font-semibold text-red-600">
                ⚠️ Bạn đang đi chệch route!
              </p>
            </div>
          )}

          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
              Còn lại
            </p>
            {distanceToDestination !== null ? (
              <p className="font-mono text-2xl font-bold text-primary pt-2">
                {distanceToDestination.toFixed(1)} km
              </p>
            ) : (
              <p className="animate-pulse font-medium text-md text-ink/30 pt-2">
                Đang tính...
              </p>
            )}
          </div>

          <div className="text-center">
            {estimatedTimeRemaining !== null ? (
              <p className="text-xs text-ink/60">
                Dự kiến ~{Math.ceil(estimatedTimeRemaining)} phút
              </p>
            ) : (
              <p className="animate-pulse text-xs text-ink/30">-- phút</p>
            )}
          </div>
        </div>

        {/* Nút Thoát */}
        <button
          type="button"
          onClick={onStopNavigation}
          className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-red-600 active:scale-95"
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Thoát
        </button>
      </div>
    );
  }

  // Nút "Về giữa" khi chưa bắt đầu navigation
  return (
    <div className="pointer-events-auto absolute bottom-32 left-1/2 z-0 -translate-x-1/2">
      <button
        type="button"
        onClick={onStartNavigation}
        className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-90 active:scale-95"
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
        Về giữa
      </button>
    </div>
  );
}
