"use client";

import { useEffect, useState } from "react";
import type { RouteGeometry, RouteStop } from "@/lib/types";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface RouteStatsBarProps {
  route: RouteGeometry;
  stops: RouteStop[];
}

/** Formats a minute count as "X giờ Y phút" or just "Y phút" when under an hour. */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours === 0 ? `${mins} phút` : `${hours} giờ ${mins} phút`;
}

/** Floating stat cards summarizing the current trip with dynamic accent colors. */
export function RouteStatsBar({ route, stops }: RouteStatsBarProps) {
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

  return (
    <div className="pointer-events-none absolute left-2 right-2 top-2 z-30 flex flex-wrap justify-end gap-1.5 sm:left-auto sm:right-4 sm:top-4 sm:flex-nowrap sm:gap-2 max-w-[calc(100vw-1rem)] sm:max-w-none">
      {/* 1. Tổng quãng đường */}
      <div className="pointer-events-auto flex-1 min-w-[100px] sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-ink/85 px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-xl backdrop-blur-md transition-all">
        <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wide text-cream/50 whitespace-nowrap">
          Tổng quãng đường
        </p>
        <p
          className={`font-mono text-[12px] sm:text-lg font-bold ${getValueColorClass()} whitespace-nowrap`}
        >
          {route.distanceKm.toFixed(1)} km
        </p>
      </div>

      {/* 2. Thời gian ước tính */}
      <div className="pointer-events-auto flex-1 min-w-[100px] sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-ink/85 px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-xl backdrop-blur-md transition-all">
        <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wide text-cream/50 whitespace-nowrap">
          Thời gian ước tính
        </p>
        <p
          className={`font-mono text-[12px] sm:text-lg font-bold ${getValueColorClass()} whitespace-nowrap`}
        >
          {formatDuration(route.durationMinutes)}
        </p>
      </div>

      {/* 3. Trễ do giao thông (Chỉ hiện trên Desktop/Tablet với hidden sm:block) */}
      {hasTrafficDelay && (
        <div className="pointer-events-auto hidden sm:block min-w-[100px] sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-ink/85 px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-xl backdrop-blur-md transition-all">
          <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wide text-cream/50 whitespace-nowrap">
            Trễ do giao thông
          </p>
          <p
            className={`font-mono text-[12px] sm:text-lg font-bold ${getValueColorClass()} whitespace-nowrap`}
          >
            {formatDuration(route.trafficDelayMinutes!)}
          </p>
        </div>
      )}

      {/* 4. Điểm dừng */}
      <div className="pointer-events-auto flex-1 min-w-[100px] sm:flex-none rounded-xl sm:rounded-2xl border border-white/10 bg-ink/85 px-2.5 py-1.5 sm:px-4 sm:py-2.5 shadow-xl backdrop-blur-md transition-all">
        <p className="text-[9px] sm:text-[10px] font-medium uppercase tracking-wide text-cream/50 whitespace-nowrap">
          Điểm dừng
        </p>
        <p
          className={`font-mono text-[12px] sm:text-lg font-bold ${getValueColorClass()} whitespace-nowrap`}
        >
          {stops.length} điểm
        </p>
      </div>
    </div>
  );
}
