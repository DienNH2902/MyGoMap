"use client";

import { useEffect, useState } from "react";
import type { RouteGeometry, RouteStop } from "@/lib/types";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface RouteStatsBarProps {
  route: RouteGeometry;
  stops: RouteStop[];
  isNavigating?: boolean;
  isPanelOpen?: boolean;
}

/** Formats a minute count as "X giờ Y phút" or just "Y phút" when under an hour. */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours === 0 ? `${mins} phút` : `${hours} giờ ${mins} phút`;
}

/** Floating stat cards summarizing the current trip with dynamic accent colors. */
export function RouteStatsBar({
  route,
  stops,
  isNavigating = false,
  isPanelOpen = false,
}: RouteStatsBarProps) {
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const getValueColorClass = () => {
    if (gender === "nu") return "text-pink-400";
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-300 via-rose-400 to-violet-400 bg-clip-text text-transparent";
    }
    return "text-accent-gold";
  };

  const hasTrafficDelay =
    typeof route.trafficDelayMinutes === "number" &&
    route.trafficDelayMinutes > 0;

  if (isNavigating || isPanelOpen) return null;

  return (
    <div className="pointer-events-none absolute bottom-4 left-2 right-2 z-30 flex max-w-[calc(100vw-1rem)] flex-wrap justify-end gap-1.5 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:max-w-none sm:flex-nowrap sm:gap-2">
      {/* 1. Tổng quãng đường */}
      <div className="pointer-events-auto min-w-[100px] flex-1 rounded-xl border border-white/10 bg-ink/85 px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all sm:min-w-0 sm:flex-none sm:rounded-2xl sm:px-4 sm:py-2.5">
        <p className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-cream/50 sm:text-[10px]">
          Quãng đường
        </p>
        <p
          className={`whitespace-nowrap font-mono text-[12px] font-bold sm:text-lg ${getValueColorClass()}`}
        >
          {route.distanceKm.toFixed(1)} km
        </p>
      </div>

      {/* 2. Thời gian ước tính */}
      <div className="pointer-events-auto min-w-[100px] flex-1 rounded-xl border border-white/10 bg-ink/85 px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all sm:min-w-0 sm:flex-none sm:rounded-2xl sm:px-4 sm:py-2.5">
        <p className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-cream/50 sm:text-[10px]">
          Thời gian
        </p>
        <p
          className={`whitespace-nowrap font-mono text-[12px] font-bold sm:text-lg ${getValueColorClass()}`}
        >
          {formatDuration(route.durationMinutes)}
        </p>
      </div>

      {/* 3. Trễ do giao thông (Chỉ hiện trên Desktop/Tablet) */}
      {hasTrafficDelay && (
        <div className="pointer-events-auto hidden min-w-[100px] rounded-xl border border-white/10 bg-ink/85 px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all sm:block sm:min-w-0 sm:flex-none sm:rounded-2xl sm:px-4 sm:py-2.5">
          <p className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-cream/50 sm:text-[10px]">
            Trễ do giao thông
          </p>
          <p
            className={`whitespace-nowrap font-mono text-[12px] font-bold sm:text-lg ${getValueColorClass()}`}
          >
            {formatDuration(route.trafficDelayMinutes!)}
          </p>
        </div>
      )}

      {/* 4. Điểm dừng */}
      <div className="pointer-events-auto min-w-[100px] flex-1 rounded-xl border border-white/10 bg-ink/85 px-2.5 py-1.5 shadow-xl backdrop-blur-md transition-all sm:min-w-0 sm:flex-none sm:rounded-2xl sm:px-4 sm:py-2.5">
        <p className="whitespace-nowrap text-[9px] font-medium uppercase tracking-wide text-cream/50 sm:text-[10px]">
          Điểm dừng
        </p>
        <p
          className={`whitespace-nowrap font-mono text-[12px] font-bold sm:text-lg ${getValueColorClass()}`}
        >
          {stops.length} điểm
        </p>
      </div>
    </div>
  );
}
