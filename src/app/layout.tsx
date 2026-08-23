import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { ServiceWorkerRegistration } from "@/components/common/ServiceWorkerRegistration";

// Be Vietnam Pro: full Vietnamese diacritic support, used for both headings and body text.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// JetBrains Mono: used for distances, times, and other route statistics, for a data-forward feel.
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mỳ Gõ Map — Phượt Việt Nam",
  description:
    "Mỳ Gõ Map giúp bạn tìm đường, gợi ý trạm xăng, trạm dừng chân, quán ăn và cà phê dọc tuyến đường — hoàn toàn miễn phí.",
  manifest: "/manifest.json",
  icons: {
    // Icon dùng trong tab trình duyệt (favicon)
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    // BẮT BUỘC cho iOS: icon hiện trên màn hình chính khi "Thêm vào MH chính"
    // KHÔNG được lấy từ manifest.json trên iOS — Safari chỉ đọc thẻ
    // <link rel="apple-touch-icon">, đây chính là lý do trước đây "không có
    // ảnh logo app" dù manifest.json đã khai icon (Android đọc manifest,
    // iOS thì không). File cũ (/icons/icon-192x192.png) trước đây còn
    // KHÔNG TỒN TẠI trên đĩa nên iOS luôn 404 khi xin icon này.
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mỳ Gõ Map",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  // viewport-fit=cover để nội dung tràn đúng ra mép màn hình có notch/tai thỏ
  // khi chạy standalone trên iPhone — tránh dải trắng/đen thừa 2 bên.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${jetBrainsMono.variable}`}
    >
      <body className="bg-surface font-display text-ink antialiased">
        <ServiceWorkerRegistration />
        <Header />
        {children}
      </body>
    </html>
  );
}
