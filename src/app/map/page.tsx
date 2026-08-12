import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { MapExperience } from "@/components/map/MapExperience";
import AvatarApp from "@/assets/Chân dung mèo xám.png";

export const metadata: Metadata = {
  title: "MyGoMap — Lập lộ trình",
  icons: {
    icon: "/assets/vietnam.png", // Đường dẫn tính từ thư mục public
  },
};

export default function MapPage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-surface">
      <Header />
      <MapExperience />
    </main>
  );
}
