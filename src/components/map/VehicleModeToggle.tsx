"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface VehicleModeToggleProps {
  label?: string;
  avoidHighways: boolean;
  onChange: (avoidHighways: boolean) => void;
}

/**
 * Segmented "Ô tô / Xe máy" toggle component styled dynamically based on user gender theme.
 */
export function VehicleModeToggle({
  label = "Loại xe",
  avoidHighways,
  onChange,
}: VehicleModeToggleProps) {
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const getActiveStyles = () => {
    if (gender === "nu") {
      return "bg-pink-500 text-white shadow";
    }
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 text-white shadow";
    }
    return "bg-primary text-white shadow";
  };

  const getHoverStyles = () => {
    if (gender === "nu") return "hover:bg-pink-50 hover:text-pink-500";
    if (gender === "khac") return "hover:bg-purple-50 hover:text-purple-500";
    return "hover:bg-slate-100 hover:text-slate-900";
  };

  return (
    <div className="flex flex-1 flex-col justify-end min-w-[120px]">
      {label && (
        <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-cream/50">
          {label}
        </span>
      )}
      <div className="flex h-[44px] items-center gap-1 rounded-2xl border border-ink/10 bg-black/20 p-1">
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!avoidHighways}
          className={clsx(
            "flex h-full w-1/2 items-center justify-center gap-1 rounded-xl px-1.5 sm:px-3 text-xs font-semibold transition whitespace-nowrap",
            !avoidHighways
              ? getActiveStyles()
              : clsx("bg-transparent text-cream/90", getHoverStyles()),
          )}
        >
          <span>Ô tô</span>
        </button>

        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={avoidHighways}
          className={clsx(
            "flex h-full w-1/2 items-center justify-center gap-1 rounded-xl px-1.5 sm:px-3 text-xs font-semibold transition whitespace-nowrap",
            avoidHighways
              ? getActiveStyles()
              : clsx("bg-transparent text-cream/90", getHoverStyles()),
          )}
        >
          <span>Xe máy</span>
        </button>
      </div>
    </div>
  );
}
