import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { ServiceWorkerRegistration } from "@/components/common/ServiceWorkerRegistration";
import { MobileRedirect } from "@/components/common/MobileRedirect";

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
  manifest: "/manifest.webmanifest",
  icons: {
    // Icon dùng trong tab trình duyệt (favicon)
    icon: [
      // { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      // { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/assets/mygomaplogo.png", sizes: "16x16", type: "image/png" },
    ],
    // BẮT BUỘC cho iOS: icon hiện trên màn hình chính khi "Thêm vào MH chính"
    // KHÔNG được lấy từ manifest.json trên iOS — Safari chỉ đọc thẻ
    // <link rel="apple-touch-icon">, đây chính là lý do trước đây "không có
    // ảnh logo app" dù manifest.json đã khai icon (Android đọc manifest,
    // iOS thì không). File cũ (/icons/icon-192x192.png) trước đây còn
    // KHÔNG TỒN TẠI trên đĩa nên iOS luôn 404 khi xin icon này.
    apple: [{ url: "/mobilelogo.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Mỳ Gõ Map",
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6A1A",
  // width/initialScale khai báo tường minh (thay vì để Next tự chèn mặc
  // định) để đảm bảo luôn ra đúng "width=device-width, initial-scale=1" —
  // không bị lệ thuộc vào giá trị mặc định của từng phiên bản Next.js.
  width: "device-width",
  initialScale: 1,
  // Khoá cứng scale=1: đây là app dạng bản đồ toàn màn hình, việc phóng to
  // (pinch-zoom) cả TRANG là không cần thiết vì bản thân bản đồ (MapLibre)
  // đã tự xử lý cử chỉ zoom riêng. Khoá scale còn chặn triệt để tình trạng
  // Safari "tự zoom" trang khi chạm vào ô nhập liệu rồi không zoom lại —
  // kết hợp với việc ép font-size ô nhập liệu tối thiểu 16px trong
  // globals.css, lỗi "vào app bị zoom to phải tự zoom tay lại" được chặn ở
  // cả 2 lớp (nguyên nhân gốc + hàng rào an toàn).
  maximumScale: 1,
  userScalable: false,
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
        <MobileRedirect />
        <ServiceWorkerRegistration />
        <Header />
        {children}
      </body>
    </html>
  );
}
