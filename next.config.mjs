import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development", // Tắt PWA khi dev để tránh cache code
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: "/", // Trả về trang chủ nếu route bị offline
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
