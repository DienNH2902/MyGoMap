"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

type GenderTheme = "nam" | "nu" | "khac";
const STORAGE_KEY_NAME = "mygomap_user_name";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

/** Fixed top header shown on every page, carrying the MyGoMap brand mark front and center. */
export function Header() {
  const [userInfo, setUserInfo] = useState<{
    name: string;
    gender: GenderTheme;
  } | null>(null);

  useEffect(() => {
    const name = localStorage.getItem(STORAGE_KEY_NAME) ?? "";
    const gender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";

    if (name.trim()) {
      setUserInfo({ name: name.trim(), gender });
    }
  }, []);

  const gender = userInfo?.gender ?? "nam";

  // Màu gradient cho chữ Logo MyGoMap
  const getLogoGradientClass = () => {
    if (gender === "nu") {
      return "from-pink-400 via-rose-300 to-pink-500";
    }
    if (gender === "khac") {
      return "from-amber-300 via-rose-400 to-violet-400";
    }
    return "from-primary via-accent-gold to-primary";
  };

  // Style cho Badge câu chào
  const getGreetingBadgeClass = () => {
    if (gender === "nu") {
      return "border-pink-500/20 bg-pink-500/10 text-pink-300";
    }
    if (gender === "khac") {
      return "border-violet-500/20 bg-violet-500/10 bg-gradient-to-r from-amber-300 via-rose-300 to-violet-300 bg-clip-text text-transparent";
    }
    return "border-primary/20 bg-primary/10 text-accent-gold";
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/5 bg-ink/90 px-6 backdrop-blur-md">
      <Link href="/" className="group flex items-center gap-2">
        <Image
          src="/assets/logo3.png"
          alt="MyGoMap Logo"
          width={100}
          height={100}
          className="h-8 w-8 rounded-full object-cover transition-transform group-hover:scale-105"
        />
        <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-[length:200%_auto] bg-clip-text text-xl font-extrabold tracking-tight text-transparent transition-[background-position] duration-700 group-hover:bg-right">
          MyGoMap
        </span>
      </Link>

      <nav className="hidden items-center gap-6 text-sm font-medium text-cream/70 sm:flex">
        {userInfo ? (
          <span
            className={`rounded-md border px-3.5 py-1 text-md font-semibold ${getGreetingBadgeClass()}`}
          >
            Hôm nay {userInfo.name} muốn đi đâu?
          </span>
        ) : (
          <span className="rounded-md border border-white/10 bg-white/5 px-3.5 py-1 text-md font-semibold text-cream/50">
            Chưa rõ tên bạn
          </span>
        )}
      </nav>
    </header>
  );
}
