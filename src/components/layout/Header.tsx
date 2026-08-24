"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InstallAppButton } from "../common/InstallAppButton";

type GenderTheme = "nam" | "nu" | "khac";

const STORAGE_KEY_NAME = "mygomap_user_name";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

// Danh sách các trang điều hướng
const NAV_ITEMS = [
  { label: "Bản đồ", href: "/map" },
  { label: "Mục đích", href: "/purpose" },
  { label: "Thành viên", href: "/members" },
  { label: "Công nghệ", href: "/tech-stack" },
  { label: "Cấu trúc", href: "/structure" },
  { label: "Cập nhật", href: "/changelog" },
];

/** Fixed top header shown on every page, carrying the MyGoMap brand mark front and center. */
export function Header() {
  const [userInfo, setUserInfo] = useState<{
    name: string;
    gender: GenderTheme;
  } | null>(null);

  const [hasUserInfo, setHasUserInfo] = useState<boolean>(false);

  const pathname = usePathname();

  useEffect(() => {
    const checkUserInfo = () => {
      const name = (localStorage.getItem(STORAGE_KEY_NAME) ?? "").trim();

      const gender =
        (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";

      const rawGender = localStorage.getItem(STORAGE_KEY_GENDER);

      if (name) {
        setUserInfo({ name, gender });
      } else {
        setUserInfo(null);
      }

      // Mở khóa nếu đã có đầy đủ Tên và Giới tính
      setHasUserInfo(Boolean(name && rawGender));
    };

    checkUserInfo();

    // Lắng nghe thay đổi khi mở nhiều tab hoặc
    // bắn Custom Event trong cùng tab
    window.addEventListener("storage", checkUserInfo);
    window.addEventListener("user-info-updated", checkUserInfo);

    return () => {
      window.removeEventListener("storage", checkUserInfo);

      window.removeEventListener("user-info-updated", checkUserInfo);
    };
  }, []);

  useEffect(() => {
    const name = localStorage.getItem(STORAGE_KEY_NAME) ?? "";

    const gender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderTheme) || "nam";

    if (name.trim()) {
      setUserInfo({
        name: name.trim(),
        gender,
      });
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
    <header
      className="
        fixed inset-x-0 top-0 z-40
        flex h-[var(--header-h)]
        items-center
        border-b border-white/5
        bg-ink/90
        px-4 sm:px-6
        pt-[var(--safe-top)]
        backdrop-blur-md

        lg:grid
        lg:grid-cols-3
      "
    >
      {/* =========================================================
          LOGO
          Mobile:
            - Chỉ hiển thị Logo - Việt Nam
            - Không có navigation
            - Không có greeting

          Desktop:
            - Giữ nguyên logo hiện tại
         ========================================================= */}
      <Link
        href="/"
        className="
          group
          flex
          min-w-0
          shrink
          items-center
          gap-1.5
        "
      >
        <span
          className="
            bg-gradient-to-r
            from-primary
            via-accent-gold
            to-primary
            bg-[length:200%_auto]
            bg-clip-text
            text-lg
            font-extrabold
            tracking-tight
            text-transparent
            transition-[background-position]
            duration-700
            group-hover:bg-right

            sm:text-xl
            lg:text-2xl
          "
        >
          Mỳ Gõ Map
        </span>

        <span
          className="
            bg-gradient-to-r
            from-primary
            via-accent-gold
            to-primary
            bg-[length:200%_auto]
            bg-clip-text
            text-lg
            font-extrabold
            tracking-tight
            text-transparent
            transition-[background-position]
            duration-700
            group-hover:bg-right

            sm:text-xl
            lg:text-2xl
          "
        >
          -
        </span>

        <span
          className="
            bg-gradient-to-r
            from-red-600
            via-red-400
            to-red-600
            bg-[length:200%_auto]
            bg-clip-text
            text-lg
            font-extrabold
            tracking-tight
            text-transparent
            transition-[background-position]
            duration-700
            group-hover:bg-right

            sm:text-xl
            lg:text-2xl
          "
        >
          Việt Nam
        </span>

        {/* Quốc kỳ Việt Nam */}
        <svg
          className="
            ml-0.5
            inline-block
            h-4
            w-6
            shrink-0
            shadow-sm

            sm:h-5
            sm:w-7

            lg:h-6
            lg:w-8
          "
          viewBox="0 0 900 600"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Nền cờ đỏ */}
          <rect width="900" height="800" fill="#DA251D" />

          {/* Ngôi sao vàng 5 cánh */}
          <polygon
            fill="#FFFF00"
            points="
              450,150
              488,267
              612,267
              512,340
              550,457
              450,384
              350,457
              388,340
              288,267
              412,267
            "
          />
        </svg>
      </Link>

      {/* =========================================================
          NAVIGATION LINKS
          Chỉ hiển thị Desktop
         ========================================================= */}
      <nav
        className="
          hidden
          items-center
          justify-center
          gap-1.5
          text-md
          font-normal
          lg:flex
        "
      >
        {NAV_ITEMS.map((item) => {
          const isMapLink = item.href === "/map";
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={isMapLink && !hasUserInfo ? "#" : item.href}
              onClick={(e) => {
                if (isMapLink && !hasUserInfo) {
                  e.preventDefault();
                }
              }}
              className={`relative shrink-0 rounded-sm px-3 py-1 transition-all duration-300 ${
                isMapLink && !hasUserInfo
                  ? "cursor-not-allowed text-cream/40 opacity-40 hover:bg-transparent"
                  : isActive
                    ? "font-semibold text-accent-gold shadow-sm"
                    : "text-orange-400 hover:bg-amber-500/15 hover:text-amber-200 hover:shadow-[0_0_15px_rgba(245,158,11,0.35)]"
              }`}
            >
              {item.label}

              {/* Chấm tròn phát sáng dưới chân tab đang Active */}
              {isActive && (
                <span
                  className="
                    absolute
                    -bottom-1
                    left-1/2
                    h-0.5
                    w-20
                    -translate-x-1/2
                    rounded-full
                    bg-accent-gold
                    shadow-[0_0_8px_#f59e0b]
                  "
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* =========================================================
          DESKTOP RIGHT AREA
          - Download
          - Greeting
          Chỉ hiện Desktop
         ========================================================= */}
      <nav
        className="
          hidden
          items-center
          justify-end
          gap-3
          text-sm
          font-medium
          text-cream/70
          lg:flex
        "
      >
        <InstallAppButton />

        {userInfo ? (
          <span
            className={`
              rounded-md
              border
              px-3.5
              py-1
              text-md
              font-semibold
              ${getGreetingBadgeClass()}
            `}
          >
            Hôm nay {userInfo.name} muốn đi đâu?
          </span>
        ) : (
          <span
            className="
              rounded-md
              border
              border-white/10
              bg-white/5
              px-3.5
              py-1
              text-md
              font-semibold
              text-cream/50
            "
          >
            Chưa rõ tên bạn
          </span>
        )}
      </nav>

      {/* =========================================================
          MOBILE RIGHT AREA
          Chỉ có nút Install / Download

          Mobile layout:

          Mỳ Gõ Map - Việt Nam       [ Download ]

         ========================================================= */}
      <div
        className="
          ml-auto
          flex
          shrink-0
          items-center
          lg:hidden
        "
      >
        <InstallAppButton />
      </div>
    </header>
  );
}
