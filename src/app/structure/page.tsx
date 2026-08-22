import Image from "next/image";

// Dữ liệu cấu trúc thư mục dự án
const FOLDER_STRUCTURE = [
  {
    path: "src/app/",
    type: "Folder",
    desc: "Cấu trúc App Router (Next.js 14). Quản lý các trang giao diện (/map) và Server API Routes (/api/*) đóng vai trò làm backend proxy bảo vệ các API Key nhạy cảm.",
  },
  {
    path: "src/app/api/",
    type: "Backend Routes",
    desc: "Các Route Handler chạy phía máy chủ: Proxy gọi Google Gemini AI, TomTom Routing (chỉ đường xe máy & giao thông) và Overpass API mà không để lộ key xuống client.",
  },
  {
    path: "src/components/map/",
    type: "UI Components",
    desc: "Tập hợp tất cả UI tương tác với bản đồ: Bảng lập lộ trình (RoutePlannerPanel), Trợ lý AI (AiAssistantPanel), Thẻ thông tin POI, Tìm xung quanh đây và bộ chuyển đổi Map Style.",
  },
  {
    path: "src/components/landing/",
    type: "UI Components",
    desc: "Chứa các Component dành riêng cho trang chủ (Landing Page) như Banner Hero, hiệu ứng vẽ tuyến đường minh họa, nhãn và modal lịch sử cập nhật phiên bản.",
  },
  {
    path: "src/components/ui/",
    type: "Base Design System",
    desc: "Các phần tử UI dùng chung như nút bấm (Button), hiệu ứng tải dữ liệu (LoadingSpinner, OwlLoadingSpinner), bộ chọn số lượng điểm dừng (NumberStepper).",
  },
  {
    path: "src/hooks/",
    type: "Custom Hooks",
    desc: "Logic nghiệp vụ chính: useRoutePlanner (quản lý lộ trình, điểm dừng, POI), usePoiEnrichment (tự động tải ảnh Mapillary/Wikimedia) và useDebouncedValue.",
  },
  {
    path: "src/lib/routing/",
    type: "Modules",
    desc: "Module tính toán lộ trình di chuyển: Tích hợp OpenRouteService cho ô tô và TomTom Routing API chuyên biệt dành riêng cho xe máy.",
  },
  {
    path: "src/lib/images/",
    type: "Modules",
    desc: "Module xử lý hình ảnh thực tế POI: Ưu tiên tải ảnh góc nhìn người đi đường từ Mapillary, tự động dự phòng sang Wikimedia Commons khi không tìm thấy.",
  },
  {
    path: "src/lib/overpass/",
    type: "Modules",
    desc: "Module gửi truy vấn Overpass QL để quét và cào dữ liệu chi tiết các địa điểm dịch vụ (trạm xăng, quán ăn, cà phê, trạm dừng) từ OpenStreetMap.",
  },
  {
    path: "src/lib/geo/",
    type: "Helper",
    desc: "Sử dụng Turf.js xử lý hình học không gian hoàn toàn ở client: chia đều khoảng cách điểm dừng, chiếu điểm vuông góc lên tuyến đường và cắt đoạn lộ trình.",
  },
];

export default function StructurePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-ink text-cream">
      {/* Background Ảnh nền định vị cố định bên phải, làm mờ nhẹ */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-end">
        <div className="relative h-full w-full lg:w-3/4 opacity-25 blur-[1px]">
          <Image
            src="/assets/vnbg.png"
            alt="MyGoMap Vietnam Background"
            fill
            priority
            unoptimized
            className="object-cover object-center"
          />
        </div>
      </div>

      {/* Lớp phủ Gradient tối giúp tăng độ tương phản đọc chữ */}
      <div className="fixed inset-0 z-0 bg-gradient-to-r from-ink via-ink/90 to-transparent pointer-events-none" />

      {/* Nội dung chính lệch sang bên trái */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-28 pb-20">
        <div className="max-w-3xl lg:max-w-5xl">
          {/* Tiêu đề trang */}
          <div className="mb-10 text-left">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent-gold">
              Mã nguồn & Kiến trúc
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
              Cấu trúc thư mục{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                Mỳ Gõ Map
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-cream/80 sm:text-lg">
              Tổng quan sơ đồ tổ chức mã nguồn, vai trò từng thư mục chức năng
              và truy cập dự án trực tiếp trên GitHub repository.
            </p>
          </div>

          <div className="space-y-8">
            {/* Section 1: Repository GitHub */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-3 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                Mã nguồn công khai (Open Repository)
              </h2>
              <p className="text-sm leading-relaxed text-cream/80 sm:text-base mb-6">
                Dự án được quản lý và phát triển công khai trên GitHub. Bạn có
                thể truy cập repo để xem chi tiết commit, đóng góp mã nguồn hoặc
                báo lỗi sản phẩm.
              </p>

              <a
                href="https://github.com/DienNH2902/MyGoMap"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-xl bg-primary/20 border border-primary/40 px-5 py-3 font-semibold text-primary hover:bg-primary/30 transition-all group"
              >
                <svg
                  className="h-6 w-6 fill-current text-primary group-hover:scale-110 transition-transform"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Xem Project trên GitHub (DienNH2902/MyGoMap)</span>
                <span className="text-accent-gold group-hover:translate-x-1 transition-transform">
                  →
                </span>
              </a>
            </section>

            {/* Section 2: Cấu trúc cây thư mục (Tree View) */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                Cây thư mục tổng quan (Directory Tree)
              </h2>
              <pre className="overflow-x-auto rounded-xl bg-ink/80 border border-cream/10 p-4 font-mono text-xs text-cream/90 leading-relaxed">
                {`MyGoMap/
├── .env                                # Biến môi trường (TomTom, Gemini, MapTiler, Mapillary, ORS...)
├── next.config.mjs                     # Cấu hình Next.js App Router & Domain hình ảnh
├── package.json                        # Khai báo phụ thuộc và thư viện chính
├── tsconfig.json                       # Cấu hình biên dịch TypeScript strict mode
│
└── src/                                # Thư mục mã nguồn chính của ứng dụng
    ├── global.d.ts                     # Thư viện định kiểu TypeScript toàn cục
    │
    ├── app/                            # Routing chính theo App Router của Next.js 14
    │   ├── globals.css                 # CSS toàn cục (Tailwind UI, animations)
    │   ├── layout.tsx                  # Bố cục giao diện chung (Header, Root Provider)
    │   ├── page.tsx                    # Trang chủ chính (Landing Page)
    │   ├── map/page.tsx                # Trang bản đồ tương tác chính (/map)
    │   └── api/                        # Server Route Handlers (Backend Proxy)
    │       ├── gemini/route.ts         # Proxy gọi API Google Gemini AI
    │       ├── overpass/route.ts       # Proxy truy vấn POI từ Overpass OpenStreetMap
    │       ├── tomtom/route/route.ts   # Proxy tính toán đường đi xe máy (TomTom)
    │       └── traffic/flow/           # Proxy tải mảnh bản đồ mật độ giao thông
    │
    ├── components/                     # React UI Components
    │   ├── common/                     # Component dùng chung (LocationRequest, ...)
    │   ├── landing/                    # Các Component chuyên biệt cho Landing Page
    │   ├── layout/                     # Khung giao diện (Header, Navigation)
    │   ├── map/                        # Bảng tương tác bản đồ (RoutePlanner, AiAssistant...)
    │   └── ui/                         # Base UI Design System (Button, Spinner, Stepper...)
    │
    ├── hooks/                          # Custom React Hooks
    │   ├── useDebouncedValue.ts        # Hook hoãn thời gian gửi request khi gõ phím
    │   ├── usePoiEnrichment.ts         # Hook tự động cào và gắn ảnh cho POI
    │   └── useRoutePlanner.ts          # Hook quản lý toàn bộ trạng thái lộ trình & điểm dừng
    │
    └── lib/                            # Các thư viện bổ trợ, API Client & Thuật toán
        ├── constants.ts                # Hằng số hệ thống (vận tốc, bán kính, tọa độ)
        ├── types.ts                    # Định nghĩa Data Types (POI, Route, Location)
        ├── ai/geminiClient.ts          # Client gửi prompt tới Gemini AI
        ├── geo/turfHelpers.ts          # Hàm Turf.js tính toán hình học địa lý
        ├── geocoding/nominatim.ts      # Client tìm kiếm tên địa điểm & reverse geocode
        ├── images/                     # Client cào ảnh từ Mapillary & Wikimedia
        ├── overpass/overpassClient.ts  # Client truy vấn dữ liệu hạ tầng từ OpenStreetMap
        └── routing/                    # Client tính toán lộ trình ORS & TomTom`}
              </pre>
            </section>

            {/* Section 3: Bảng vai trò chi tiết từng thư mục */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                Chi tiết chức năng các thư mục nòng cốt
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-cream/80">
                  <thead className="border-b border-cream/10 text-xs uppercase tracking-wider text-accent-gold">
                    <tr>
                      <th scope="col" className="pb-3 pr-4 font-semibold w-1/3">
                        Đường dẫn Folder
                      </th>
                      <th scope="col" className="pb-3 px-4 font-semibold w-1/6">
                        Phân loại
                      </th>
                      <th scope="col" className="pb-3 pl-4 font-semibold">
                        Mô tả chức năng & Vai trò
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream/5">
                    {FOLDER_STRUCTURE.map((item) => (
                      <tr
                        key={item.path}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3.5 pr-4 font-mono text-xs font-semibold text-cream align-top">
                          {item.path}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold text-accent-gold whitespace-nowrap align-top">
                          {item.type}
                        </td>
                        <td className="py-3.5 pl-4 text-cream/80 leading-relaxed align-top">
                          {item.desc}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
