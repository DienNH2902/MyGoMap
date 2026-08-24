"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
// import { HeroRouteLine } from "./HeroRouteLine";
import { Button } from "../ui/Button";
import Image from "next/image";

const STORAGE_KEY_NAME = "mygomap_user_name";
const STORAGE_KEY_GENDER = "mygomap_user_gender";
const STORAGE_KEY_LOADER = "mygomap_user_loader";

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
      localStorage.setItem(STORAGE_KEY_LOADER, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY_NAME);
    }
    window.dispatchEvent(new Event("user-info-updated"));
  };

  // Cập nhật giới tính vào localStorage
  const handleGenderChange = (value: GenderType) => {
    setGender(value);
    if (value) {
      localStorage.setItem(STORAGE_KEY_GENDER, value);
      localStorage.setItem(STORAGE_KEY_LOADER, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY_GENDER);
    }
    window.dispatchEvent(new Event("user-info-updated"));
  };

  // Xóa toàn bộ thông tin người dùng
  const handleResetUser = () => {
    setUserName("");
    setGender("");
    localStorage.removeItem(STORAGE_KEY_NAME);
    localStorage.removeItem(STORAGE_KEY_GENDER);
    localStorage.removeItem(STORAGE_KEY_LOADER);
    window.dispatchEvent(new Event("user-info-updated"));
  };

  const hasUserInfo = Boolean(userName.trim() && gender);

  // Danh xưng phù hợp dựa trên giới tính
  const getHonorific = () => {
    if (gender === "nam") return "anh";
    if (gender === "nu") return "chị";
    return "bạn";
  };

  // Style màu sắc cho tên người dùng dựa trên giới tính
  const getUserNameGradientClass = () => {
    if (gender === "nu") {
      return "from-pink-400 via-rose-300 to-pink-500 drop-shadow-[0_2px_2px_rgba(126,34,206,0.8)]";
    }
    if (gender === "khac") {
      return "from-amber-300 via-rose-400 to-violet-400 drop-shadow-[0_2px_2px_rgba(126,34,206,0.8)]";
    }
    return "from-primary via-accent-gold to-primary drop-shadow-[0_2px_14px_rgba(234,88,12,0.7)]";
  };

  // Style màu nền gradient cho Nút bấm dựa trên giới tính
  const getButtonGenderClass = () => {
    if (gender === "nu") {
      return "bg-gradient-to-r from-pink-500 via-rose-400 to-pink-600 hover:brightness-110 text-white border-none";
    }
    if (gender === "khac") {
      return "bg-gradient-to-r from-amber-400 via-rose-500 to-violet-500 hover:brightness-110 text-white border-none";
    }
    return "bg-gradient-to-r from-primary to-accent-gold text-ink shadow-glow hover:brightness-110 active:brightness-95"; // Mặc định dùng style gốc của Button variant="primary"
  };

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink px-6 py-12">
      {/* Ambient glow behind the copy, reinforcing the orange brand color. */}
      {/* <div className="absolute left-1/2 top-1/3 h-[500px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[140px]" />
      <HeroRouteLine /> */}

      {/* Background Video */}
      {/* <video
        autoPlay
        loop
        muted
        preload="auto"
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/assets/mapvideo.mp4" type="video/mp4" /> */}
      {/* <source src="/assets/china-cat.mp4" type="video/mp4" /> */}
      {/* </video> */}

      <Image
        src="/assets/landing.png" // Thay đường dẫn tới ảnh của bạn trong thư mục public
        alt="Background"
        fill
        priority // Ưu tiên load ngay lập tức vì đây là ảnh nền chính
        quality={100}
        sizes="100vw"
        className="object-cover object-center"
      />

      <div className="absolute inset-0 bg-ink/30" />

      {/* Lớp phủ dải màu tối giúp tương phản chữ tốt hơn */}
      {/* <div className="pointer-events-none absolute inset-0 bg-ink/50 bg-[radial-gradient(ellipse_at_top_left,_rgba(15,23,42,0.85)_0%,_transparent_60%),_radial-gradient(ellipse_at_bottom_right,_rgba(15,23,42,0.85)_0%,_transparent_60%)] backdrop-blur-[5px]" /> */}

      {/* Overlay lớp phủ tối tỏa từ tâm quanh khu vực chữ */}
      {/* <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(15,23,42,0.98)_0%,_rgba(15,23,42,0.85)_30%,_rgba(15,23,42,0.3)_55%,_transparent_100%)]" /> */}

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-6 text-center">
        {/* Logo MyGoMap */}
        <div className="relative flex items-center justify-center pt-4">
          {/* Hiệu ứng hào quang/glow phía sau logo */}
          {/* <div className="absolute h-24 w-24 rounded-full bg-primary/30 blur-2xl" /> */}
          <Image
            src="/assets/mygomapthumbnail.png"
            alt="MyGoMap Logo"
            width={400}
            height={400}
            priority
            unoptimized
            className="relative h-28 w-28 object-contain transition-transform duration-300 sm:h-52 sm:w-52 drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]"
          />
        </div>

        <h1 className="hidden text-4xl font-extrabold leading-tight tracking-tight text-cream sm:text-6xl md:block">
          {isHydrated && hasUserInfo ? (
            <>
              <span className="drop-shadow-[0_2px_8px_rgba(255,255,255,0.4)]">
                Chào mừng{" "}
              </span>
              <span
                className={`bg-gradient-to-r ${getUserNameGradientClass()} bg-clip-text text-transparent`}
              >
                {getHonorific()} {userName.trim()}
              </span>
            </>
          ) : (
            <>
              <span className="drop-shadow-[0_2px_4px_rgba(255,255,255,0.4)]">
                Chào mừng đến với
              </span>
              <br />
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent drop-shadow-[0_2px_14px_rgba(234,88,12,0.7)]">
                Mỳ Gõ Map
              </span>
            </>
          )}
        </h1>

        <p className="max-w-xl text-balance text-base leading-relaxed text-cream/90 sm:text-lg">
          <span className="bg-gradient-to-r from-amber-300 via-rose-400 to-violet-400 bg-clip-text font-extrabold text-transparent drop-shadow-[0_2px_3px_rgba(126,34,206,0.8)]">
            Phượt thủ à!
          </span>{" "}
          <span className="drop-shadow-[0_2px_12px_rgba(255,255,255,0.75)]">
            - chúng tôi giúp bạn lên kế hoạch cho mọi hành trình trên khắp Việt
            Nam: tìm đường đi nhanh nhất, tự động gợi ý trạm xăng, trạm dừng
            chân, quán ăn hay quán cà phê ngay trên tuyến đường của bạn -
          </span>{" "}
          <span className="bg-gradient-to-r from-amber-300 via-rose-400 to-violet-400 bg-clip-text font-extrabold text-transparent drop-shadow-[0_2px_3px_rgba(126,34,206,0.8)]">
            hoàn toàn miễn phí.
          </span>
        </p>

        {/* Khối nhập thông tin người dùng */}
        <div className="w-full max-w-md rounded-2xl border border-cream/10 bg-white/5 p-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 flex-col text-left">
              <label
                htmlFor="user-name"
                className="mb-1 text-sm font-medium text-cream/60"
              >
                Tên của bạn
              </label>
              <input
                id="user-name"
                type="text"
                placeholder="Nhập tên…"
                maxLength={20}
                value={userName}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full rounded-xl border border-cream/15 bg-white/10 px-3.5 py-2 text-sm text-cream placeholder:text-cream/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex flex-col text-left sm:w-36">
              <label
                htmlFor="user-gender"
                className="mb-1 text-sm font-medium text-cream/60"
              >
                Giới tính
              </label>
              <div className="relative cursor-pointer">
                <select
                  id="user-gender"
                  value={gender}
                  onChange={(e) =>
                    handleGenderChange(e.target.value as GenderType)
                  }
                  className="w-full cursor-pointer appearance-none rounded-xl border border-cream/15 bg-white/10 py-2 pl-3.5 pr-8 text-sm text-cream backdrop-blur-md transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="text-md font-medium text-cream/40 transition hover:text-rose-400"
              >
                Xóa thông tin
              </button>
            </div>
          )}
        </div>

        {/* Action Button: Bị disable khi chưa điền đủ tên và giới tính */}
        {hasUserInfo ? (
          <Link href="/map">
            <Button
              variant="primary"
              className={`mt-2 px-8 py-4 text-base transition-all duration-300 ${getButtonGenderClass()}`}
            >
              Bắt đầu hành trình <span aria-hidden="true">→</span>
            </Button>
          </Link>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Button
              variant="primary"
              disabled
              className={`mt-2 cursor-not-allowed opacity-50 px-8 py-4 text-base transition-all duration-300 ${getButtonGenderClass()}`}
            >
              Bắt đầu hành trình <span aria-hidden="true">→</span>
            </Button>
            <span className="text-md text-cream/90 drop-shadow-[0_2px_12px_rgba(255,255,255,0.75)]">
              Vui lòng nhập tên và chọn giới tính để bắt đầu
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
