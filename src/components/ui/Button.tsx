"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "outline" | "ghost";
type GenderTheme = "nam" | "nu" | "khac";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const STORAGE_KEY_GENDER = "mygomap_user_gender";

/** Dynamic classes per variant and gender theme */
function getVariantClasses(
  variant: ButtonVariant,
  gender: GenderTheme,
): string {
  if (variant === "primary") {
    if (gender === "nu") {
      return "bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white shadow-md hover:brightness-110 active:brightness-95";
    }
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-600 text-white shadow-md hover:brightness-110 active:brightness-95";
    }
    // Nam (Default)
    return "bg-gradient-to-r from-primary to-accent-gold text-ink shadow-glow hover:brightness-110 active:brightness-95";
  }

  if (variant === "outline") {
    if (gender === "nu") {
      return "border border-pink-500/40 text-cream hover:bg-pink-500/10";
    }
    if (gender === "khac") {
      return "border border-purple-500/40 text-cream hover:bg-purple-500/10";
    }
    return "border border-primary/40 text-cream hover:bg-primary/10";
  }

  // Ghost variant
  if (gender === "nu") {
    return "text-cream/90 hover:bg-pink-500/15 hover:text-pink-300";
  }
  if (gender === "khac") {
    return "text-cream/90 hover:bg-purple-500/15 hover:text-purple-300";
  }
  return "text-cream/90 hover:bg-primary/20 hover:text-white";
}

/** Shared button used across MyGoMap, styled based on user gender theme. */
export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: ButtonProps) {
  const [gender, setGender] = useState<GenderTheme>("nam");

  useEffect(() => {
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";
    setGender(savedGender);
  }, []);

  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        getVariantClasses(variant, gender),
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
