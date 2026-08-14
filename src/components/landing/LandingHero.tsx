"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeroRouteLine } from "./HeroRouteLine";
import { Button } from "../ui/Button";

const STORAGE_KEY_NAME = "mygomap_user_name";
const STORAGE_KEY_GENDER = "mygomap_user_gender";

export type GenderType = "nam" | "nu" | "khac" | "";

/** Landing page hero: welcome message, short description, and the entry point into /map. */
export function LandingHero() {
  const [userName, setUserName] = useState<string>("");
  const [gender, setGender] = useState<GenderType>("");
  const [isHydrated, setIsHydrated] = useState<boolean>(false);

  // Đọc thông tin từ localStorage khi component mount trên client
  useEffect(() => {
    const savedName = localStorage.getItem(STORAGE_KEY_NAME) ?? "";
    const savedGender =
      (localStorage.getItem(STORAGE_KEY_GENDER) as GenderType) ?? "";
    setUserName(savedName);
    setGender(savedGender);
    setIsHydrated(true);
  }, []);

  // Cập nhật tên vào localStorage
  const handleNameChange = (value: string) => {
    setUserName(value);
    if (value.trim()) {
      localStorage.setItem(STORAGE_KEY_NAME, value.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_NAME);
    }
  };

  // Cập nhật giới tính vào localStorage
  const handleGenderChange = (value: GenderType) => {
    setGender(value);
    if (value) {
      localStorage.setItem(STORAGE_KEY_GENDER, value);
    } else {
      localStorage.removeItem(STORAGE_KEY_GENDER);
    }
  };

  // Xóa toàn bộ thông tin người dùng
  const handleResetUser = () => {
    setUserName("");
    setGender("");
    localStorage.removeItem(STORAGE_KEY_NAME);
    localStorage.removeItem(STORAGE_KEY_GENDER);
  };

  const hasUserInfo = Boolean(userName.trim() && gender);

  // Danh xưng phù hợp dựa trên giới tính
  const getHonorific = () => {
    if (gender === "nam") return "anh";
    if (gender === "nu") return "chị";
    return "bạn";
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 py-12">
      {/* Ambient glow behind the copy, reinforcing the orange brand color. */}
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/assets/china-cat.mp4" type="video/mp4" />
      </video>

      {/* Overlay lớp phủ tối giúp chữ hiển thị rõ ràng */}
      <div className="absolute inset-0 bg-ink/75" />

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6 text-center">
        <span className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.2em] text-accent-gold">
          Lộ trình thông minh cho mọi chuyến đi
        </span>

        <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-cream sm:text-6xl">
          {isHydrated && hasUserInfo ? (
            <>
              Chào mừng{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                {getHonorific()} {userName.trim()}
              </span>
            </>
          ) : (
            <>
              Chào mừng đến với{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                MyGoMap
              </span>
            </>
          )}
        </h1>

        <p className="max-w-xl text-balance text-base leading-relaxed text-cream/70 sm:text-lg">
          MyGoMap giúp bạn lên kế hoạch cho mọi hành trình trên khắp Việt Nam:
          tìm đường đi nhanh nhất, tự động gợi ý trạm xăng, trạm dừng chân, quán
          ăn hay quán cà phê ngay trên tuyến đường của bạn — hoàn toàn miễn phí.
        </p>

        {/* Khối nhập thông tin người dùng */}
        <div className="w-full max-w-md rounded-2xl border border-cream/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col text-left">
              <label
                htmlFor="user-name"
                className="mb-1 text-xs font-medium text-cream/60"
              >
                Tên của bạn
              </label>
              <input
                id="user-name"
                type="text"
                placeholder="Nhập tên…"
                value={userName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-xl border border-cream/15 bg-white/10 px-3.5 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex flex-col text-left sm:w-36">
              <label
                htmlFor="user-gender"
                className="mb-1 text-xs font-medium text-cream/60"
              >
                Giới tính
              </label>
              <div className="relative">
                <select
                  id="user-gender"
                  value={gender}
                  onChange={(e) =>
                    handleGenderChange(e.target.value as GenderType)
                  }
                  className="w-full appearance-none rounded-xl border border-cream/15 bg-white/10 py-2 pl-3.5 pr-8 text-sm text-cream backdrop-blur-md transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option
                    value=""
                    disabled
                    className="bg-[#0f172a] text-cream/40"
                  >
                    -- Chọn --
                  </option>
                  <option
                    value="nam"
                    className="bg-[#0f172a] text-cream hover:bg-primary/20"
                  >
                    Nam
                  </option>
                  <option
                    value="nu"
                    className="bg-[#0f172a] text-cream hover:bg-primary/20"
                  >
                    Nữ
                  </option>
                  <option
                    value="khac"
                    className="bg-[#0f172a] text-cream hover:bg-primary/20"
                  >
                    🌈?
                  </option>
                </select>

                {/* Mũi tên Custom Dropdown */}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-cream/50">
                  <svg
                    className="h-4 w-4 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                  >
                    <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Nút Xóa thông tin (hiển thị khi đã nhập ít nhất 1 trường) */}
          {isHydrated && (userName || gender) && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={handleResetUser}
                className="text-s font-medium text-cream/40 transition hover:text-rose-400"
              >
                Xóa thông tin
              </button>
            </div>
          )}
        </div>

        {/* Action Button: Bị disable khi chưa điền đủ tên và giới tính */}
        {hasUserInfo ? (
          <Link href="/map">
            <Button variant="primary" className="mt-2 px-8 py-4 text-base">
              Bắt đầu hành trình <span aria-hidden="true">→</span>
            </Button>
          </Link>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="primary"
              disabled
              className="mt-2 opacity-50 cursor-not-allowed px-8 py-4 text-base"
            >
              Bắt đầu hành trình <span aria-hidden="true">→</span>
            </Button>
            <span className="text-xs text-cream/40">
              Vui lòng nhập tên và chọn giới tính để bắt đầu
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
