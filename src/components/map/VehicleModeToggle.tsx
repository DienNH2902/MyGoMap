"use client";

import { clsx } from "clsx";

interface VehicleModeToggleProps {
  label?: string;
  avoidHighways: boolean;
  onChange: (avoidHighways: boolean) => void;
}

/**
 * Segmented "Ô tô / Xe máy" toggle component.
 * Cấu trúc wrapper tương thích hoàn toàn với layout flex alignment của RoutePlannerPanel.
 */
export function VehicleModeToggle({
  label = "Loại xe",
  avoidHighways,
  onChange,
}: VehicleModeToggleProps) {
  return (
    <div className="flex flex-1 flex-col justify-end">
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
          {label}
        </span>
      )}
      <div className="flex h-[42px] items-center gap-1 rounded-xl border border-ink/10 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange(false)}
          aria-pressed={!avoidHighways}
          className={clsx(
            "flex w-full h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
            !avoidHighways
              ? "bg-primary text-white shadow-sm"
              : "text-ink/60 hover:text-primary",
          )}
        >
          🚗 Ô tô
        </button>

        <button
          type="button"
          onClick={() => onChange(true)}
          aria-pressed={avoidHighways}
          className={clsx(
            "flex w-full h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
            avoidHighways
              ? "bg-primary text-white shadow-sm"
              : "text-ink/60 hover:text-primary",
          )}
        >
          🏍️ Xe máy
        </button>
      </div>

      {/* <span className="text-[11px] text-ink/40">
        {avoidHighways
          ? "Sẽ tránh mọi đoạn cao tốc"
          : "Sẽ sử dụng mọi đoạn cao tốc"}
      </span> */}
    </div>
  );
}
