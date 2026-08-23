import type { Metadata } from "next";
import { Be_Vietnam_Pro, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";

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
  // title: "Mỳ Gõ Map — Lập lộ trình thông minh khắp Việt Nam",
  title: "Mỳ Gõ Map — Phượt Việt Nam",
  icons: {
    icon: "/assets/mygomaplogo.png", // Đường dẫn tính từ thư mục public
  },
  description:
    "Mỳ Gõ Map giúp bạn tìm đường, gợi ý trạm xăng, trạm dừng chân, quán ăn và cà phê dọc tuyến đường — hoàn toàn miễn phí.",
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
        <Header />
        {children}
      </body>
    </html>
  );
}
