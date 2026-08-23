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
  register: false,
  skipWaiting: true,
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
