"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY_NAME = "mygomap_user_name";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

/** Fixed top header shown on every page, carrying the MyGoMap brand mark front and center. */
export function Header() {
  const [userInfo, setUserInfo] = useState<{
    name: string;
    gender: string;
  } | null>(null);

  useEffect(() => {
    const name = localStorage.getItem(STORAGE_KEY_NAME) ?? "";
    const gender = localStorage.getItem(STORAGE_KEY_GENDER) ?? "";

    if (name.trim()) {
      setUserInfo({ name: name.trim(), gender });
    }
  }, []);

  const getHonorific = (gender: string) => {
    if (gender === "nam") return "anh";
    if (gender === "nu") return "chị";
    return "bạn";
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/5 bg-ink/90 px-6 backdrop-blur-md">
      <Link href="/" className="group flex items-center gap-2">
        <span className="text-2xl">🧭</span>
        <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-[length:200%_auto] bg-clip-text text-xl font-extrabold tracking-tight text-transparent transition-[background-position] duration-700 group-hover:bg-right">
          MyGoMap
        </span>
      </Link>

      <nav className="hidden items-center gap-6 text-sm font-medium text-cream/70 sm:flex">
        {userInfo ? (
          <span className="rounded-md border border-primary/20 bg-primary/10 px-3.5 py-1 text-md font-semibold text-accent-gold">
            Hôm nay {userInfo.name} muốn đi đâu?
          </span>
        ) : (
          <span className="rounded-md border border-primary/20 bg-primary/10 px-3.5 py-1 text-md font-semibold text-accent-gold">
            Chưa rõ tên bạn
          </span>
        )}
      </nav>
    </header>
  );
}
