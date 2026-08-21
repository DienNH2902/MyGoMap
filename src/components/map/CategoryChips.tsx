"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { POI_CATEGORIES } from "@/lib/constants";
import type { PoiCategoryId } from "@/lib/types";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

interface CategoryChipsProps {
  label?: string;
  selected: PoiCategoryId[];
  onToggle: (id: PoiCategoryId) => void;
}

/** Multi-select toggle chips styled dynamically based on user gender theme. */
export function CategoryChips({
  label = "Danh mục",
  selected,
  onToggle,
}: CategoryChipsProps) {
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  const getActiveStyles = () => {
    if (gender === "nu") {
      return "border-pink-500 bg-pink-500 text-white shadow";
    }
    if (gender === "khac") {
      return "border-purple-300 bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 text-white shadow";
    }
    return "border-primary bg-primary text-white shadow";
  };

  const getHoverStyles = () => {
    if (gender === "nu") {
      return "hover:bg-pink-50 hover:text-pink-500";
    }
    if (gender === "khac") {
      return "hover:bg-purple-50 hover:text-purple-500";
    }
    return "hover:bg-slate-100 hover:text-slate-900";
  };

  return (
    <div className="flex flex-col justify-end">
      <div>
        {label && (
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-cream/50">
            {label}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {POI_CATEGORIES.map((category) => {
          const isActive = selected.includes(category.id);
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onToggle(category.id)}
              className={clsx(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                isActive
                  ? getActiveStyles()
                  : clsx(
                      "border-ink/10 bg-black/20 text-cream/90",
                      getHoverStyles(),
                    ),
              )}
            >
              <span aria-hidden="true">{category.icon}</span>
              {category.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
