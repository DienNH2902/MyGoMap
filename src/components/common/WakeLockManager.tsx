"use client";

import { useEffect, useRef } from "react";

/**
 * Đối tượng trả về từ `navigator.wakeLock.request()` — chỉ khai báo lại tối
 * thiểu phần dùng tới (`release`), KHÔNG dựa vào type `WakeLockSentinel` có
 * sẵn trong lib.dom, vì tuỳ phiên bản TypeScript/target lib của dự án mà
 * type đó có thể chưa được định nghĩa, gây lỗi biên dịch không cần thiết.
 */
interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock extends Omit<Navigator, "wakeLock"> {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

/**
 * Giữ màn hình luôn sáng khi đang mở app, dùng Screen Wake Lock API chuẩn
 * W3C (`navigator.wakeLock`) — được Chrome/Edge/Android WebView và Safari
 * (iOS 16.4+) hỗ trợ. Trình duyệt cũ hơn không có API này thì component đơn
 * giản không làm gì cả (không lỗi, không cảnh báo) — cố tình KHÔNG dùng các
 * kỹ thuật "giả" kiểu phát video ẩn (NoSleep.js) vì không đáng tin cậy và
 * tốn thêm dependency chỉ để hỗ trợ số ít trình duyệt rất cũ.
 *
 * QUAN TRỌNG: Wake Lock bị chính trình duyệt TỰ ĐỘNG release khi tab/app
 * chuyển xuống nền (khoá màn hình, chuyển sang app khác...) — đây là hành
 * vi bảo mật/tiết kiệm pin bắt buộc của bản thân API, không có cách nào ép
 * giữ khi đang ở nền. Nên cần lắng nghe `visibilitychange` để XIN LẠI wake
 * lock ngay khi người dùng quay lại app (visible), giống cách các app điều
 * hướng thật (Google Maps...) xử lý.
 */
export function WakeLockManager() {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      // Trình duyệt không hỗ trợ Wake Lock API — bỏ qua, không có gì để làm, return luôn.
      return;
    }

    const nav = navigator as NavigatorWithWakeLock;
    let cancelled = false;

    const requestWakeLock = async () => {
      try {
        const sentinel = await nav.wakeLock?.request("screen");
        if (!sentinel) return;

        if (cancelled) {
          // Effect đã bị dọn (unmount, hoặc visibilitychange dồn dập) trong
          // lúc đang chờ Promise — release ngay, không giữ lại một wake
          // lock mồ côi không ai theo dõi.
          void sentinel.release();
          return;
        }

        wakeLockRef.current = sentinel;
        console.log("[WakeLock-Sáng màn hình] Đã bật — màn hình sẽ không tự tắt.");
      } catch (err) {
        // Có thể bị từ chối (tab không active, pin yếu tự chặn trên một số
        // thiết bị Android...) — im lặng bỏ qua, đây chỉ là tiện ích phụ,
        // không ảnh hưởng chức năng chính của app nên không cần báo lỗi cho
        // người dùng.
        console.warn("Không thể bật Wake Lock:", err);
      }
    };

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log("[WakeLock] Đã tắt.");
      }
    };
  }, []);

  return null;
}
