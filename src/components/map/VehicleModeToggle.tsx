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
      return "bg-pink-500 text-white shadow-sm";
    }
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 text-white shadow-sm";
    }
    return "bg-primary text-white shadow-sm";
  };

  const getHoverStyles = () => {
    if (gender === "nu") return "hover:text-pink-500";
    if (gender === "khac") return "hover:text-purple-500";
    return "hover:text-primary";
  };

  return (
    <div className="flex flex-1 flex-col justify-end">
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
          {label}
        </span>
      )}
      <div className="flex h-[43px] items-center gap-1 rounded-xl border border-ink/10 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!avoidHighways}
          className={clsx(
            "flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
            !avoidHighways
              ? getActiveStyles()
              : clsx("text-ink/60", getHoverStyles()),
          )}
        >
          Ô tô
        </button>

        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={avoidHighways}
          className={clsx(
            "flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
            avoidHighways
              ? getActiveStyles()
              : clsx("text-ink/60", getHoverStyles()),
          )}
        >
          Xe máy
        </button>
      </div>
    </div>
  );
}
