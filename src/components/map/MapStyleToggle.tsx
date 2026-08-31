"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  MAP_STYLES,
  hasMapStyleProviderKey,
  type MapStyleId,
} from "@/lib/constants";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface MapStyleToggleProps {
  value: MapStyleId;
  onChange: (styleId: MapStyleId) => void;
  isPanelOpen?: boolean;
}

const STYLE_IDS: MapStyleId[] = [
  "standard",
  "street",
  "topo",
  "outdoor",
  "satellite",
  "openStreet",
];

export function MapStyleToggle({
  value,
  onChange,
  isPanelOpen = false,
}: MapStyleToggleProps) {
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

  if (isPanelOpen) return null;

  return (
    <div className="pointer-events-auto relative md:absolute md:left-4 md:top-4 z-30 rounded-2xl border border-ink/10 bg-ink/85 p-2 shadow-xl backdrop-blur-md max-w-full">
      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-cream/50">
        Kiểu bản đồ
      </p>

      <div className="flex flex-col md:flex-row gap-1">
        {STYLE_IDS.map((styleId) => {
          const style = MAP_STYLES[styleId];
          const isActive = value === styleId;
          const isAvailable = hasMapStyleProviderKey(styleId);

          return (
            <button
              key={style.id}
              type="button"
              disabled={!isAvailable}
              title={
                isAvailable
                  ? style.description
                  : "Cần thêm NEXT_PUBLIC_MAPTILER_KEY để dùng kiểu bản đồ này"
              }
              onClick={() => onChange(style.id)}
              className={clsx(
                "rounded-xl px-3 py-2 text-sm font-semibold transition text-cream/70 text-left md:text-center whitespace-nowrap",
                isActive
                  ? getActiveStyles()
                  : clsx("bg-transparent", getHoverStyles()),
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {style.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
