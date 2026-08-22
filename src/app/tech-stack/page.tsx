import Image from "next/image";

// 1. Công nghệ nền tảng
const CORE_TECH = [
  {
    tech: "Next.js",
    version: "14.2.5 (App Router)",
    role: "Framework ứng dụng web chính. Vừa đảm nhận render giao diện người dùng (Client Component), vừa đóng vai trò làm Backend nhẹ thông qua API Routes giúp giấu các API Key nhạy cảm (TomTom, Gemini) khỏi phía client.",
  },
  {
    tech: "React",
    version: "18.3.1",
    role: "Thư viện cốt lõi để xây dựng giao diện người dùng (UI), quản lý state linh hoạt và chia nhỏ ứng dụng thành các Component tái sử dụng.",
  },
  {
    tech: "TypeScript",
    version: "5.5.3",
    role: "Ngôn ngữ lập trình chính với chế độ kiểm tra kiểu dữ liệu nghiêm ngặt (strict typing) trên toàn bộ dự án, giúp hạn chế lỗi runtime và tăng độ tin cậy cho code.",
  },
  {
    tech: "Tailwind CSS",
    version: "3.4.6",
    role: "Framework CSS dạng Utility-first dùng để thiết kế toàn bộ giao diện, hiệu ứng chuyển cảnh, hỗ trợ chế độ tối/sáng và responsive mượt mà trên nhiều thiết bị.",
  },
  {
    tech: "MapLibre GL JS",
    version: "4.5.2",
    role: "Engine mã nguồn mở hiển thị bản đồ dạng Vector (được chọn để thay thế Google Maps/Mapbox GL), hỗ trợ xoay, phóng to/thu nhỏ mượt mà và tương tác với các lớp dữ liệu bản đồ.",
  },
  {
    tech: "Turf.js (@turf/turf)",
    version: "7.1.0",
    role: "Thư viện tính toán hình học địa lý chạy hoàn toàn ở client-side: tính khoảng cách thực tế, chia đều các điểm trên đường tuyến, cắt đoạn tuyến và chiếu điểm vuông góc lên đường đi mà không cần gọi API ngoài.",
  },
  {
    tech: "clsx",
    version: "2.1.1",
    role: "Thư viện tiện ích nhỏ gọn hỗ trợ ghép và xử lý chuỗi class CSS (Tailwind) theo điều kiện một cách rõ ràng và gọn gàng.",
  },
];

// 2. API / Dịch vụ bên thứ 3
const INTEGRATED_SERVICES = [
  {
    service: "OpenRouteService (ORS)",
    keyRequired: "Có — NEXT_PUBLIC_ORS_API_KEY",
    source: "Client (openRouteService.ts)",
    role: "Dịch vụ định tuyến chính dành cho ô tô (driving-car, ưu tiên đi đường cao tốc mặc định). Đồng thời đóng vai trò làm phương án dự phòng (fallback) để tính toán lộ trình cho xe máy khi dịch vụ TomTom gặp sự cố.",
  },
  {
    service: "TomTom Routing API",
    keyRequired: "Có — TOMTOM_API_KEY (giấu ở server)",
    source: "Server route /api/tomtom/route",
    role: "Dịch vụ định tuyến chính cho xe máy (travelMode=motorcycle, avoid=motorways) — đây là API duy nhất hỗ trợ đúng thuật toán chuẩn dành riêng cho xe 2 bánh có động cơ. Đồng thời hỗ trợ tính toán lộ trình theo thời gian thực có tính đến tình trạng tắc đường.",
  },
  {
    service: "TomTom Traffic Flow Tiles",
    keyRequired: "Có — TOMTOM_API_KEY",
    source: "Server route /api/traffic/flow/[z]/[x]/[y]",
    role: "Cung cấp các mảnh bản đồ (tile) hiển thị mật độ giao thông theo thời gian thực (màu xanh/vàng/đỏ) để vẽ đè lên bản đồ chính, giúp người dùng nhận biết nhanh các điểm ùn tắc.",
  },
  {
    service: "Nominatim (OpenStreetMap)",
    keyRequired: "Không",
    source: "Client (nominatim.ts)",
    role: "Công cụ tìm kiếm địa điểm theo tên (autocomplete hiển thị gợi ý ngay trong ô nhập) và chuyển đổi tọa độ ngược thành địa chỉ văn bản (reverse-geocoding) cho các điểm gợi ý thiếu thông tin.",
  },
  {
    service: "Overpass API",
    keyRequired: "Không",
    source: "Client (overpassClient.ts)",
    role: "Công cụ truy vấn dữ liệu chi tiết từ OpenStreetMap: tìm kiếm các địa điểm quan tâm (POI) theo danh mục xung quanh điểm dừng, tìm trạm dừng chân hoặc lối ra cao tốc để tự động 'snap' (gắn chặt) điểm dừng.",
  },
  {
    service: "Google Gemini",
    keyRequired: "Có — GEMINI_API_KEY (giấu ở server)",
    source: "Server route /api/gemini",
    role: "Trí tuệ nhân tạo (model gemini-flash-lite-latest) dùng để tạo nhanh các gợi ý lịch trình ngắn cho chuyến đi và đóng vai trò làm trợ lý thông minh 'MeoMeo AI' giải đáp thắc mắc người dùng.",
  },
  {
    service: "Mapillary",
    keyRequired: "Có — NEXT_PUBLIC_MAPILLARY_TOKEN",
    source: "Client (mapillaryClient.ts)",
    role: "Nguồn cung cấp ảnh chụp thực tế ngoài đường phố/quán xá góc nhìn người đi đường (street-view) tại các điểm POI (được ưu tiên số 1 khi hiển thị hình ảnh).",
  },
  {
    service: "Wikimedia Commons",
    keyRequired: "Không",
    source: "Client (wikimediaCommons.ts)",
    role: "Nguồn ảnh dự phòng (ưu tiên số 2) khi Mapillary không tìm thấy ảnh chụp thực tế. Thích hợp để lấy hình ảnh minh họa cho các danh lam thắng cảnh và địa danh nổi tiếng.",
  },
  {
    service: "MapTiler",
    keyRequired: "Có — NEXT_PUBLIC_MAPTILER_KEY",
    source: "Client (constants.ts)",
    role: "Cung cấp các lớp kiểu dáng bản đồ đa dạng để người dùng linh hoạt chuyển đổi: Địa hình, Outdoor, Vệ tinh, Đường phố.",
  },
  {
    service: "CARTO Positron",
    keyRequired: "Không",
    source: "Client (constants.ts)",
    role: "Cung cấp giao diện bản đồ mặc định tone sáng/tối tối giản, đồng thời làm phương án dự phòng nếu khóa API MapTiler không khả dụng.",
  },
];

// 3. Hằng số quan trọng
const SYSTEM_PARAMS = [
  {
    param: "MOTORBIKE_AVERAGE_SPEED_KMH",
    value: "35 km/h",
    role: "Tốc độ trung bình giả định của xe máy. Dùng để tính toán lại thời gian di chuyển thực tế cho chính xác (vì các API như ORS/TomTom thường mặc định tính theo vận tốc ô tô gây sai lệch lớn).",
  },
  {
    param: "CAR_AVERAGE_SPEED_KMH",
    value: "50 km/h",
    role: "Tốc độ trung bình giả định của ô tô trên lộ trình hỗn hợp, dùng để tính lại thời gian ước tính đến nơi (ETA) phù hợp với thực tế đường sá Việt Nam.",
  },
  {
    param: "POI_SEARCH_RADIUS_METERS",
    value: "8.000m (8 km)",
    role: "Bán kính tối đa để thuật toán quét và tìm kiếm các địa điểm dừng chân/dịch vụ (POI) xung quanh mỗi điểm dừng trên tuyến đường.",
  },
  {
    param: "AUTO_SEARCH_INTERVAL_KM",
    value: "50 km",
    role: "Khi người dùng không ấn định số điểm dừng cụ thể nhưng có chọn danh mục (ví dụ 'Cây xăng'), hệ thống sẽ tự động rải các điểm tìm kiếm cách đều nhau mỗi 50km dọc lộ trình.",
  },
  {
    param: "MAX_POIS_PER_CATEGORY_PER_STOP",
    value: "5 địa điểm",
    role: "Giới hạn số lượng POI tối đa hiển thị cho mỗi danh mục tại mỗi điểm dừng để tránh làm rối bản đồ và quá tải thông tin cho người dùng.",
  },
  {
    param: "MAX_CUSTOM_STOPS",
    value: "10 điểm",
    role: "Số lượng điểm dừng tối đa mà người dùng có thể tự thêm thủ công vào lộ trình chuyến đi.",
  },
  {
    param: "Giới hạn số điểm dừng (auto)",
    value: "0 – 10 điểm",
    role: "Khoảng giới hạn tự động bằng công thức Math.max(0, Math.min(10, count)) áp dụng trong hook useRoutePlanner.ts để đảm bảo hiệu năng tính toán.",
  },
  {
    param: "HIGHWAY_SNAP_WINDOW_KM",
    value: "20 km",
    role: "Phạm vi cửa sổ tìm kiếm xung quanh một mốc dừng tự động nhằm tìm trạm dừng nghỉ hoặc lối ra cao tốc gần nhất để điều chỉnh điểm dừng vào đó.",
  },
  {
    param: "HIGHWAY_SNAP_MAX_OFFSET_KM",
    value: "25 km",
    role: "Hệ số khoảng cách an toàn. Nếu trạm dừng hoặc lối ra cao tốc tìm thấy nằm quá khoảng cách 25km so với mốc lý tưởng, hệ thống sẽ bỏ qua không 'snap' vào đó.",
  },
  {
    param: "OVERPASS_TIMEOUT_MS",
    value: "20.000 ms (20 giây)",
    role: "Thời gian chờ tối đa cho mỗi yêu cầu truy vấn dữ liệu POI gửi tới máy chủ Overpass API trước khi hủy request.",
  },
  {
    param: "OVERPASS_MAX_ATTEMPTS",
    value: "2 lần",
    role: "Số lần thử lại (retry) tối đa khi việc gửi request tới Overpass API gặp lỗi mạng hoặc bị hết thời gian chờ (timeout).",
  },
  {
    param: "ORS_TIMEOUT_MS",
    value: "20.000 ms (20 giây)",
    role: "Thời gian chờ tối đa cho các request tính toán lộ trình gửi tới OpenRouteService.",
  },
  {
    param: "Bán kính ảnh Mapillary",
    value: "50 m",
    role: "Khoảng cách tối đa từ hình ảnh thực tế tới tọa độ POI. Bắt buộc ảnh phải nằm trong phạm vi ≤ 50m mới được công nhận là ảnh trực quan của địa điểm đó.",
  },
  {
    param: "Bán kính ảnh Wikimedia",
    value: "400 m",
    role: "Phạm vi quét ảnh rộng hơn do dữ liệu ảnh Wikimedia Commons thưa thớt hơn, phù hợp cho các điểm du lịch lớn.",
  },
  {
    param: "DEFAULT_MAP_ZOOM",
    value: "5.2",
    role: "Mức độ thu phóng (zoom level) mặc định khi vừa truy cập ứng dụng, giúp hiển thị bao quát toàn bộ lãnh thổ Việt Nam.",
  },
  {
    param: "VIETNAM_CENTER",
    value: "105.8342, 21.0278",
    role: "Tọa độ tâm bản đồ mặc định khi khởi tạo ứng dụng.",
  },
  {
    param: "Radius 'Tìm quanh đây'",
    value: "50m / 1km / 2km / 5km / 10km",
    role: "Các mức bán kính tùy chọn để quét tìm địa điểm xung quanh một vị trí bất kỳ trong bảng AroundSearchPanel.",
  },
];

// 4. Danh mục POI hỗ trợ
const POI_CATEGORIES = [
  {
    name: "Trạm xăng",
    icon: "⛽",
    tag: "amenity=fuel",
    desc: "Tìm kiếm các cây xăng và trạm cung cấp nhiên liệu dọc tuyến",
  },
  {
    name: "Dừng chân",
    icon: "🛣️",
    tag: "highway=rest_area",
    desc: "Các trạm dừng nghỉ chính thức trên cao tốc và quốc lộ",
  },
  {
    name: "Quán ăn",
    icon: "🍜",
    tag: "amenity=restaurant",
    desc: "Nhà hàng, quán ăn phục vụ bữa chính cho tài xế/phượt thủ",
  },
  {
    name: "Cà phê",
    icon: "☕",
    tag: "amenity=cafe",
    desc: "Quán nước, cà phê nghỉ chân thư giãn giữa chặng",
  },
  {
    name: "Khách sạn",
    icon: "🛏️",
    tag: "tourism=hotel",
    desc: "Địa điểm lưu trú, nhà nghỉ, khách sạn dừng chân qua đêm",
  },
  {
    name: "ATM",
    icon: "🏧",
    tag: "amenity=atm",
    desc: "Cây rút tiền tự động của các ngân hàng",
  },
  {
    name: "Cửa hàng tiện lợi",
    icon: "🏪",
    tag: "shop=convenience",
    desc: "Cửa hàng bách hóa, tiệm tiện lợi 24/7 để mua nhu yếu phẩm",
  },
  {
    name: "Nhà thuốc",
    icon: "💊",
    tag: "amenity=pharmacy",
    desc: "Tiệm thuốc tây chuẩn bị vật dụng y tế sơ cứu khi cần",
  },
];

// 5. Tính năng chính theo component
const CORE_FEATURES = [
  {
    title: "Lập lộ trình thông minh",
    desc: "Cho phép chọn điểm đi (A) và điểm đến (B) với ô tìm kiếm gợi ý tự động (Nominatim). Người dùng có thể chọn loại phương tiện (ô tô hoặc xe máy), cài đặt các điểm dừng tự động (hệ thống tự chia đều quãng đường và thông minh né dải phân cách cao tốc) hoặc tự thêm tối đa 10 điểm dừng thủ công, chọn tìm các loại dịch vụ POI mong muốn dọc lộ trình.",
  },
  {
    title: "Trợ lý AI chuyến đi (AiAssistantPanel)",
    desc: "Tích hợp mô hình Google Gemini để phân tích lộ trình, đưa ra các gợi ý tự động về lịch trình di chuyển, lời khuyên an toàn và hỗ trợ giao tiếp hỏi-đáp trực tiếp qua linh vật trợ lý 'MeoMeo AI'.",
  },
  {
    title: "Tìm kiếm xung quanh (AroundSearchPanel)",
    desc: "Tính năng quét tìm các địa điểm dịch vụ theo bán kính linh hoạt (từ 50m đến 10km) quanh một vị trí bất kỳ do người dùng chọn, hoạt động hoàn toàn độc lập với lộ trình chuyến đi.",
  },
  {
    title: "Chi tiết điểm dừng & POI (StopDetailDrawer, PoiDetailCard)",
    desc: "Hiển thị thông tin chi tiết từng trạm dừng, tích hợp cơ chế tải hình ảnh thực tế thông minh theo thứ tự ưu tiên: Ảnh chụp đường phố Mapillary ➔ Ảnh tư liệu Wikimedia Commons ➔ Biểu tượng icon theo danh mục.",
  },
  {
    title: "Đổi kiểu bản đồ linh hoạt (MapStyleToggle)",
    desc: "Cho phép chuyển đổi qua lại giữa 5 giao diện bản đồ khác nhau: Mặc định (Thường), Địa hình (Terrain), Dã ngoại (Outdoor), Ảnh vệ tinh (Satellite) và Đường phố (Streets) thông qua MapTiler và dự phòng CARTO.",
  },
  {
    title: "Hiển thị mật độ giao thông theo thời gian thực",
    desc: "Tích hợp lớp bản đồ mật độ giao thông từ TomTom Traffic Flow Tiles, trực quan hóa mức độ ùn tắc giao thông bằng các dải màu (xanh, vàng, đỏ) ngay trên tuyến đường.",
  },
  {
    title: "Cá nhân hóa theo giới tính",
    desc: "Tùy chọn danh xưng/giới tính (Nam / Nữ / Khác) được lưu trực tiếp trên localStorage trình duyệt, giúp tự động điều chỉnh tông màu và phong cách xưng hô giao diện phù hợp với người dùng.",
  },
  {
    title: "Nhãn chủ quyền lãnh thổ cố định",
    desc: "Hiển thị lớp nhãn khẳng định chủ quyền lãnh thổ không thể thay đổi tại các khu vực biển đảo thiêng liêng: Hoàng Sa, Trường Sa và Biển Đông trực tiếp trên bản đồ số.",
  },
];

export default function TechnologyPage() {
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
              Hệ thống kỹ thuật & Dữ liệu
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
              Thống kê & Kiến trúc{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                Mỳ Gõ Map
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-cream/80 sm:text-lg">
              Bảng thống kê chi tiết toàn bộ công nghệ nền tảng, các tích hợp
              API bên thứ ba, hằng số thuật toán, danh mục POI và danh sách tính
              năng cốt lõi vận hành ứng dụng.
            </p>
          </div>

          <div className="space-y-8">
            {/* Section 1: Công nghệ nền tảng */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                1. Công nghệ nền tảng (Core Stack)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-cream/80">
                  <thead className="border-b border-cream/10 text-xs uppercase tracking-wider text-accent-gold">
                    <tr>
                      <th scope="col" className="pb-3 pr-4 font-semibold w-1/4">
                        Công nghệ
                      </th>
                      <th scope="col" className="pb-3 px-4 font-semibold w-1/6">
                        Phiên bản
                      </th>
                      <th scope="col" className="pb-3 pl-4 font-semibold">
                        Vai trò & Chi tiết chức năng
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream/5">
                    {CORE_TECH.map((item) => (
                      <tr
                        key={item.tech}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3.5 pr-4 font-bold text-cream align-top">
                          {item.tech}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-accent-gold font-mono align-top whitespace-nowrap">
                          {item.version}
                        </td>
                        <td className="py-3.5 pl-4 text-cream/80 leading-relaxed align-top">
                          {item.role}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 2: API & Dịch vụ tích hợp */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                2. API & Dịch vụ bên thứ 3 (Gói miễn phí)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-cream/80">
                  <thead className="border-b border-cream/10 text-xs uppercase tracking-wider text-accent-gold">
                    <tr>
                      <th scope="col" className="pb-3 pr-3 font-semibold w-1/5">
                        Dịch vụ
                      </th>
                      <th scope="col" className="pb-3 px-3 font-semibold w-1/4">
                        Cần Key? / Gọi từ đâu
                      </th>
                      <th scope="col" className="pb-3 pl-3 font-semibold">
                        Vai trò & Chi tiết xử lý
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream/5">
                    {INTEGRATED_SERVICES.map((item) => (
                      <tr
                        key={item.service}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3.5 pr-3 font-bold text-cream align-top">
                          {item.service}
                        </td>
                        <td className="py-3.5 px-3 align-top space-y-1">
                          <span className="block text-xs font-medium text-accent-gold">
                            {item.keyRequired}
                          </span>
                          <span className="inline-block rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono text-cream/70">
                            {item.source}
                          </span>
                        </td>
                        <td className="py-3.5 pl-3 text-cream/80 leading-relaxed align-top">
                          {item.role}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 3: Hằng số & Tham số thuật toán */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                3. Hằng số & Tham số hệ thống
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-cream/80">
                  <thead className="border-b border-cream/10 text-xs uppercase tracking-wider text-accent-gold">
                    <tr>
                      <th scope="col" className="pb-3 pr-4 font-semibold w-1/3">
                        Tên hằng số
                      </th>
                      <th scope="col" className="pb-3 px-4 font-semibold w-1/6">
                        Giá trị
                      </th>
                      <th scope="col" className="pb-3 pl-4 font-semibold">
                        Giải thích ý nghĩa & Tác dụng
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream/5">
                    {SYSTEM_PARAMS.map((item) => (
                      <tr
                        key={item.param}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3.5 pr-4 font-mono text-xs font-semibold text-cream align-top">
                          {item.param}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-bold text-accent-gold whitespace-nowrap align-top">
                          {item.value}
                        </td>
                        <td className="py-3.5 pl-4 text-cream/80 leading-relaxed align-top">
                          {item.role}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 4: Danh mục POI hỗ trợ */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                4. Danh mục POI hỗ trợ (8 loại - Gắn tag OpenStreetMap)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {POI_CATEGORIES.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-start gap-3 rounded-xl border border-cream/10 bg-white/5 p-3.5"
                  >
                    <span className="text-2xl shrink-0">{cat.icon}</span>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-cream text-sm">
                          {cat.name}
                        </h3>
                        <span className="font-mono text-[11px] text-accent-gold bg-accent-gold/10 border border-accent-gold/20 px-1.5 py-0.2 rounded">
                          {cat.tag}
                        </span>
                      </div>
                      <p className="text-xs text-cream/70">{cat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Section 5: Tính năng chính theo Component */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                5. Tính năng chính (Theo cấu trúc Component)
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-cream/80">
                {CORE_FEATURES.map((feat, index) => (
                  <div
                    key={feat.title}
                    className="border-b border-cream/5 pb-3.5 last:border-0 last:pb-0"
                  >
                    <h3 className="font-bold text-cream text-base flex items-center gap-2">
                      <span className="text-accent-gold font-mono text-xs">
                        {index + 1}.
                      </span>
                      {feat.title}
                    </h3>
                    <p className="mt-1 text-cream/75 text-sm leading-relaxed pl-5">
                      {feat.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
