"use client";

import { useCallback, useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isIOSDevice() {
  if (typeof window === "undefined") return false;

  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1)
  );
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      Boolean(
        (
          window.navigator as Navigator & {
            standalone?: boolean;
          }
        ).standalone,
      ))
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const [showButton, setShowButton] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Nếu app đã được thêm vào màn hình chính và đang chạy
    // ở chế độ standalone thì không cần hiện Download nữa.
    if (isStandaloneMode()) {
      setShowButton(false);
      return;
    }

    const ios = isIOSDevice();
    setIsIOS(ios);

    /*
     * Luôn hiển thị nút khi chưa chạy standalone.
     *
     * Android/Chrome:
     *   beforeinstallprompt → cài PWA native.
     *
     * iPhone/Safari:
     *   không có beforeinstallprompt → mở hướng dẫn
     *   Share → Add to Home Screen.
     *
     * Browser khác:
     *   mở hướng dẫn chung.
     */
    setShowButton(true);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();

      setInstallPrompt(event as BeforeInstallPromptEvent);

      setShowButton(true);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setShowButton(false);
      setShowGuide(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );

      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const closeGuide = useCallback(() => {
    setShowGuide(false);
  }, []);

  const handleInstall = useCallback(async () => {
    /*
     * Android Chrome / Chromium:
     * mở popup cài đặt PWA native.
     */
    if (installPrompt) {
      await installPrompt.prompt();

      const choice = await installPrompt.userChoice;

      if (choice.outcome === "accepted") {
        setInstallPrompt(null);
        setShowButton(false);
      }

      return;
    }

    /*
     * iOS Safari:
     *
     * Apple không cho website tự mở menu Share.
     * Vì vậy hiển thị hướng dẫn Add to Home Screen.
     */
    setShowGuide(true);
  }, [installPrompt]);

  if (!showButton) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        aria-label={
          isIOS ? "Thêm Mỳ Gõ Map vào màn hình chính" : "Cài Mỳ Gõ Map"
        }
        className="
            inline-flex items-center gap-2
            rounded-lg
            border border-emerald-500/40
            bg-emerald-500/10
            px-3 py-1.5
            text-sm font-semibold
            text-emerald-400
            shadow-sm
            transition-all duration-200
            hover:border-emerald-400/70
            hover:bg-emerald-500/20
            hover:text-emerald-200
            hover:shadow-[0_0_18px_rgba(16,185,129,0.35)]
            active:scale-95
        "
      >
        <DownloadIcon />

        <span className="hidden sm:inline">Download</span>
      </button>

      {showGuide && (
        <div
          className="
            fixed inset-0 z-[100]
            flex items-end justify-center
            bg-black/70 p-4
            backdrop-blur-sm
            sm:items-center
          "
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-app-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeGuide();
            }
          }}
        >
          <div
            className="
              relative
              w-full max-w-md
              overflow-hidden
              rounded-2xl
              border border-white/10
              bg-[#111827]
              shadow-2xl
            "
          >
            {/* Header modal */}
            <div
              className="
                flex items-start
                justify-between gap-4
                border-b border-white/10
                px-5 py-4
              "
            >
              <div>
                <p
                  className="
                    text-xs font-semibold
                    uppercase tracking-[0.18em]
                    text-primary
                  "
                >
                  Mỳ Gõ Map
                </p>

                <h2
                  id="install-app-title"
                  className="
                    mt-1
                    text-xl font-bold
                    text-white
                  "
                >
                  Thêm ứng dụng vào màn hình chính
                </h2>
              </div>

              <button
                type="button"
                onClick={closeGuide}
                aria-label="Đóng"
                className="
                  rounded-full p-2
                  text-white/60
                  transition
                  hover:bg-white/10
                  hover:text-white
                "
              >
                <XIcon />
              </button>
            </div>

            {/* Nội dung */}
            <div
              className="
                space-y-5
                px-5 py-5
                text-sm
                text-white/80
              "
            >
              {isIOS ? (
                <>
                  <p className="leading-6">
                    Safari trên iPhone không cho website tự mở menu cài đặt. Bạn
                    chỉ cần thực hiện 3 bước sau:
                  </p>

                  <div className="space-y-3">
                    {/* Step 1 */}
                    <div
                      className="
                        flex gap-3
                        rounded-xl
                        border border-white/10
                        bg-white/5
                        p-3
                      "
                    >
                      <span
                        className="
                          flex h-8 w-8
                          shrink-0
                          items-center justify-center
                          rounded-full
                          bg-primary/15
                          font-bold
                          text-primary
                        "
                      >
                        1
                      </span>

                      <div className="flex-1">
                        <p className="font-semibold text-white">Nhấn Chia sẻ</p>

                        <p className="mt-1 text-white/60">
                          Nút hình ô vuông có mũi tên đi lên trên Safari.
                        </p>
                      </div>

                      <ShareIcon />
                    </div>

                    {/* Step 2 */}
                    <div
                      className="
                        flex gap-3
                        rounded-xl
                        border border-white/10
                        bg-white/5
                        p-3
                      "
                    >
                      <span
                        className="
                          flex h-8 w-8
                          shrink-0
                          items-center justify-center
                          rounded-full
                          bg-primary/15
                          font-bold
                          text-primary
                        "
                      >
                        2
                      </span>

                      <div>
                        <p className="font-semibold text-white">
                          Chọn “Thêm vào Màn hình chính”
                        </p>

                        <p className="mt-1 text-white/60">
                          Kéo xuống trong menu Chia sẻ nếu chưa thấy mục này.
                        </p>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div
                      className="
                        flex gap-3
                        rounded-xl
                        border border-white/10
                        bg-white/5
                        p-3
                      "
                    >
                      <span
                        className="
                          flex h-8 w-8
                          shrink-0
                          items-center justify-center
                          rounded-full
                          bg-primary/15
                          font-bold
                          text-primary
                        "
                      >
                        3
                      </span>

                      <div>
                        <p className="font-semibold text-white">Nhấn “Thêm”</p>

                        <p className="mt-1 text-white/60">
                          Mỳ Gõ Map sẽ xuất hiện như một ứng dụng trên màn hình
                          chính.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="
                      rounded-xl
                      border border-primary/20
                      bg-primary/10
                      p-3
                      text-xs
                      leading-5
                      text-orange-100/80
                    "
                  >
                    Sau khi thêm, hãy mở Mỳ Gõ Map từ biểu tượng trên màn hình
                    chính để có trải nghiệm toàn màn hình giống ứng dụng.
                  </div>
                </>
              ) : (
                <p className="leading-6">
                  Trình duyệt này chưa cung cấp nút cài đặt trực tiếp. Hãy mở
                  menu của trình duyệt và chọn tùy chọn{" "}
                  <strong>Install app</strong> hoặc{" "}
                  <strong>Add to Home Screen</strong>.
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              className="
                flex justify-end
                border-t border-white/10
                px-5 py-4
              "
            >
              <button
                type="button"
                onClick={closeGuide}
                className="
                  rounded-lg
                  bg-primary
                  px-4 py-2
                  text-sm font-bold
                  text-white
                  transition
                  hover:bg-primary/90
                  active:scale-95
                "
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
