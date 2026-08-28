"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

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

  /*
   * Dùng để đảm bảo document.body đã tồn tại trước khi
   * render Portal.
   *
   * Quan trọng:
   * Modal sẽ được đưa ra ngoài Header và render trực tiếp
   * vào document.body.
   */
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    // Nếu app đã được thêm vào màn hình chính
    // và đang chạy ở chế độ standalone thì ẩn Download.
    if (isStandaloneMode()) {
      setShowButton(false);
      return;
    }

    const ios = isIOSDevice();

    setIsIOS(ios);

    // Hiển thị nút Download nếu chưa được cài.
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

  /*
   * Khóa scroll của trang khi modal đang mở.
   *
   * Đặc biệt hữu ích trên iPhone Safari:
   * - Không cho body cuộn phía sau modal.
   * - Modal giữ nguyên vị trí viewport.
   */
  useEffect(() => {
    if (!showGuide) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showGuide]);

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

  /*
   * =========================================================
   * MODAL
   *
   * KHÔNG render modal bên trong Header nữa.
   *
   * createPortal(..., document.body)
   * đưa toàn bộ modal trực tiếp xuống <body>.
   *
   * Nhờ vậy:
   * - Không bị giới hạn bởi Header.
   * - Không bị ảnh hưởng bởi backdrop-blur-md của Header.
   * - fixed thực sự bám theo viewport.
   * - z-index 9999 hoạt động đúng.
   * - iPhone Safari hiển thị toàn màn hình.
   * =========================================================
   */

  const installGuideModal =
    showGuide && isMounted
      ? createPortal(
          <div
            className="
              fixed
              inset-0
              z-[99999]

              flex
              items-center
              justify-center

              overflow-hidden

              bg-black/70
              p-4

              backdrop-blur-sm

              overscroll-none
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
            {/* =================================================
                MODAL CONTENT
               ================================================= */}
            <div
              className="
                relative
                flex
                w-full
                max-w-md
                min-h-0
                max-h-[calc(100dvh-2rem)]

                flex-col

                overflow-hidden

                rounded-2xl
                border
                border-white/10

                bg-[#111827]

                shadow-2xl

                sm:max-h-[calc(100vh-2rem)]
              "
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
            >
              {/* =================================================
                  HEADER MODAL
                 ================================================= */}
              <div
                className="
                  flex
                  shrink-0
                  items-start
                  justify-between
                  gap-4

                  border-b
                  border-white/10

                  px-5
                  py-4
                "
              >
                <div className="min-w-0">
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-[0.18em]
                      text-emerald-400
                    "
                  >
                    Mỳ Gõ Map
                  </p>

                  <h2
                    id="install-app-title"
                    className="
                      mt-1
                      text-xl
                      font-bold
                      leading-tight
                      text-white
                    "
                  >
                    Thêm ứng dụng vào màn hình chính
                  </h2>
                </div>

                {/* CLOSE */}
                <button
                  type="button"
                  onClick={closeGuide}
                  aria-label="Đóng"
                  className="
                    shrink-0
                    rounded-full
                    p-2

                    text-white/60

                    transition

                    hover:bg-white/10
                    hover:text-white

                    active:scale-95
                  "
                >
                  <XIcon />
                </button>
              </div>

              {/* =================================================
                  BODY
                 ================================================= */}
              <div
                className="
                  min-h-0
                  flex-1

                  overflow-y-auto

                  px-5
                  py-5

                  text-sm
                  text-white/80

                  overscroll-contain

                  [-webkit-overflow-scrolling:touch]
                "
              >
                {isIOS ? (
                  <>
                    <p className="leading-6">
                      Safari trên iPhone không cho website tự mở menu cài đặt.
                      Bạn chỉ cần thực hiện 3 bước sau:
                    </p>

                    <div className="mt-5 space-y-3">
                      {/* =================================================
                          STEP 1
                         ================================================= */}
                      <div
                        className="
                          flex
                          gap-3

                          rounded-xl
                          border
                          border-white/10

                          bg-white/5

                          p-3
                        "
                      >
                        <span
                          className="
                            flex
                            h-8
                            w-8
                            shrink-0

                            items-center
                            justify-center

                            rounded-full

                            bg-emerald-500/15

                            font-bold
                            text-emerald-400
                          "
                        >
                          1
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white">
                            Nhấn Chia sẻ
                          </p>

                          <p className="mt-1 leading-5 text-white/60">
                            Nhấn nút hình ô vuông có mũi tên đi lên trên Safari.
                          </p>
                        </div>

                        <ShareIcon />
                      </div>

                      {/* =================================================
                          STEP 2
                         ================================================= */}
                      <div
                        className="
                          flex
                          gap-3

                          rounded-xl
                          border
                          border-white/10

                          bg-white/5

                          p-3
                        "
                      >
                        <span
                          className="
                            flex
                            h-8
                            w-8
                            shrink-0

                            items-center
                            justify-center

                            rounded-full

                            bg-emerald-500/15

                            font-bold
                            text-emerald-400
                          "
                        >
                          2
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white">
                            Chọn “Thêm vào Màn hình chính”
                          </p>

                          <p className="mt-1 leading-5 text-white/60">
                            Kéo xuống trong menu Chia sẻ nếu chưa thấy mục này.
                          </p>
                        </div>
                      </div>

                      {/* =================================================
                          STEP 3
                         ================================================= */}
                      <div
                        className="
                          flex
                          gap-3

                          rounded-xl
                          border
                          border-white/10

                          bg-white/5

                          p-3
                        "
                      >
                        <span
                          className="
                            flex
                            h-8
                            w-8
                            shrink-0

                            items-center
                            justify-center

                            rounded-full

                            bg-emerald-500/15

                            font-bold
                            text-emerald-400
                          "
                        >
                          3
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-white">
                            Nhấn “Thêm”
                          </p>

                          <p className="mt-1 leading-5 text-white/60">
                            Mỳ Gõ Map sẽ xuất hiện như một ứng dụng trên màn
                            hình chính.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* =================================================
                        NOTE
                       ================================================= */}
                    <div
                      className="
                        mt-5

                        rounded-xl
                        border
                        border-emerald-500/20

                        bg-emerald-500/10

                        p-3

                        text-xs
                        leading-5

                        text-emerald-100/80
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

              {/* =================================================
                  FOOTER
                 ================================================= */}
              <div
                className="
                  flex
                  shrink-0
                  justify-end

                  border-t
                  border-white/10

                  px-5
                  py-4
                "
              >
                <button
                  type="button"
                  onClick={closeGuide}
                  className="
                    rounded-lg

                    bg-emerald-600

                    px-4
                    py-2

                    text-sm
                    font-bold
                    text-white

                    transition

                    hover:bg-emerald-500

                    active:scale-95
                  "
                >
                  Đã hiểu
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {/* =========================================================
          DOWNLOAD BUTTON

          Nút này vẫn nằm trong Header như logic cũ.
         ========================================================= */}
      <button
        type="button"
        onClick={handleInstall}
        aria-label={
          isIOS ? "Thêm Mỳ Gõ Map vào màn hình chính" : "Cài Mỳ Gõ Map"
        }
        className="
          inline-flex
          items-center
          gap-2

          rounded-lg

          border
          border-emerald-500/40

          bg-emerald-500/10

          px-3
          py-1.5

          text-sm
          font-semibold

          text-emerald-400

          shadow-sm

          transition-all
          duration-200

          hover:border-emerald-400/70
          hover:bg-emerald-500/20
          hover:text-emerald-200

          hover:shadow-[0_0_18px_rgba(16,185,129,0.35)]

          active:scale-95
        "
      >
        <DownloadIcon />

        <span className="hidden sm:inline">Tải về</span>
      </button>

      {/* =========================================================
          PORTAL MODAL

          Modal được render trực tiếp vào document.body.
         ========================================================= */}
      {installGuideModal}
    </>
  );
}
