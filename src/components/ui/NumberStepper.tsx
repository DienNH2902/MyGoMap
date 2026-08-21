"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { MAX_CUSTOM_STOPS } from "@/lib/constants";

type GenderTheme = "nam" | "nu" | "khac";

interface NumberStepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

const STORAGE_KEY_GENDER = "mygomap_user_gender";

/** Trả về class kiểu dáng nút bấm theo giới tính */
function getStepperButtonClasses(gender: GenderTheme): string {
  if (gender === "nu") {
    return "text-pink-400 hover:bg-pink-500/20";
  }
  if (gender === "khac") {
    return "text-purple-400 hover:bg-purple-500/20";
  }
  // Nam (Default)
  return "text-primary hover:bg-primary/20";
}

/** A labeled +/- control, styled dynamically based on user gender theme. */
export function NumberStepper({
  label,
  value,
  min = 0,
  max = MAX_CUSTOM_STOPS,
  onChange,
}: NumberStepperProps) {
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const buttonThemeClass = getStepperButtonClasses(gender);

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <span className="text-[10px] font-bold uppercase tracking-wide text-cream/50">
        {label}
      </span>
      <div className="flex h-[44px] w-full items-center justify-between gap-2 rounded-2xl border border-ink/10 bg-black/20 px-2.5 sm:w-auto sm:justify-start">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-lg font-bold transition active:scale-95 disabled:pointer-events-none disabled:opacity-30 touch-manipulation sm:h-7 sm:w-7",
            buttonThemeClass,
          )}
          aria-label="Giảm số điểm dừng"
        >
          −
        </button>

        <span className="flex-1 text-center font-mono text-sm font-bold text-cream sm:w-6 sm:flex-initial">
          {value}
        </span>

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-lg font-bold transition active:scale-95 disabled:pointer-events-none disabled:opacity-30 touch-manipulation sm:h-7 sm:w-7",
            buttonThemeClass,
          )}
          aria-label="Tăng số điểm dừng"
        >
          +
        </button>
      </div>
    </div>
  );
}
