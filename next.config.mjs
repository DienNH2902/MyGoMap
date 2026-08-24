import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // Tắt PWA khi dev để tránh cache code
  // QUAN TRỌNG: next-pwa chỉ tự chèn script đăng ký service worker cho Pages
  // Router (_document.js) — dự án này dùng App Router (src/app) nên KHÔNG có
  // file đó, và script auto-register không bao giờ chạy dù sw.js vẫn được
  // build ra bình thường. Đây chính là lý do service worker chưa từng được
  // cài trên máy người dùng, nên không có gì được cache, nên mở app offline
  // luôn thất bại. Tắt register ở đây và tự đăng ký thủ công bằng
  // ServiceWorkerRegistration.tsx (mount trong app/layout.tsx) — cách được
  // next-pwa/cộng đồng khuyến nghị chính thức cho App Router.
  register: true,
  skipWaiting: true,
  // MẶC ĐỊNH next-pwa precache TOÀN BỘ thư mục /public ngay từ bước cài đặt
  // service worker — kể cả file KHÔNG liên quan gì đến app shell. Dự án này
  // có 2 file video (mapvideo.mp4 ~73MB, china-cat.mp4 ~44MB) và hàng chục
  // ảnh landing/meme 2-3MB mỗi ảnh nằm trong /public/assets, cộng lại
  // ~172MB. Service worker phải tải XONG HẾT chừng đó trước khi được coi là
  // "installed" rồi mới chuyển sang "activated" (tức là mới thật sự bắt đầu
  // kiểm soát trang và phục vụ offline được) — đây chính là lý do thực sự
  // khiến việc test offline thất bại: mở app rồi tắt gần như ngay lập tức
  // không đủ thời gian để service worker tải xong 172MB đó, nên nó không
  // bao giờ kịp activate. Loại các file lớn/không cần thiết này khỏi
  // precache: chúng vẫn được cache BÌNH THƯỜNG khi thực sự dùng đến, chỉ là
  // qua các rule runtimeCaching có sẵn (StaleWhileRevalidate/CacheFirst theo
  // đuôi file, xem phần dưới sw.js được sinh ra) thay vì bắt buộc phải tải
  // hết ngay từ đầu.
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  publicExcludes: [
    "!assets/**/*.mp4",
    "!assets/**/*.mp3",
    "!assets/**/*.wav",
    "!assets/**/*.jpg",
    "!assets/**/*.jpeg",
    "!assets/**/*.png",
    "!assets/**/*.webp",
  ],
  fallbacks: {
    // Dùng 1 trang offline tĩnh, tối giản thay vì cả app shell ("/") — vì
    // app shell cần gọi API bản đồ/định tuyến (ORS, TomTom, Overpass...) mới
    // dùng được, những thứ này KHÔNG THỂ hoạt động offline dù có cache HTML.
    // Hiện app shell "rỗng" lúc offline dễ trông như app bị lỗi/treo hơn là
    // một trang thông báo rõ ràng "bạn đang offline, cần mạng để dùng bản đồ".
    document: "/offline",
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
