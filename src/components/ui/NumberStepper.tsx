"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";

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
    return "text-pink-500 hover:bg-pink-500/10";
  }
  if (gender === "khac") {
    return "text-purple-500 hover:bg-purple-500/10";
  }
  // Nam (Default)
  return "text-primary hover:bg-primary/10";
}

/** A labeled +/- control, styled dynamically based on user gender theme. */
export function NumberStepper({
  label,
  value,
  min = 0,
  max = 10,
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
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink/50">
        {label}
      </span>
      <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-white px-2 py-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-lg font-bold transition disabled:opacity-30",
            buttonThemeClass,
          )}
          aria-label="Giảm số điểm dừng"
        >
          −
        </button>

        <span className="w-6 text-center font-mono text-base font-semibold text-ink">
          {value}
        </span>

        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-lg font-bold transition disabled:opacity-30",
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
