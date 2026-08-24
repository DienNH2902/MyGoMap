import Image from "next/image";

export default function PurposePage() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink text-cream">
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
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-[calc(var(--header-h)+1.5rem)] pb-20">
        <div className="max-w-2xl lg:max-w-3xl">
          {/* Tiêu đề trang */}
          <div className="mb-10 text-left">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent-gold">
              Giới thiệu dự án
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
              Mục đích dự án{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                Mỳ Gõ Map
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-cream/80 sm:text-lg">
              Mỳ Gõ Map được xây dựng nhằm hỗ trợ cộng đồng phượt thủ, tài xế và
              người yêu du lịch Việt Nam dễ dàng lập lộ trình tối ưu — tích hợp
              sẵn các điểm dừng chân, trạm xăng, quán ăn và cà phê ngay trên
              tuyến đường hoàn toàn miễn phí.
            </p>
          </div>

          <div className="space-y-8">
            {/* Section 1: Sự khác biệt */}
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                Chúng tôi khác gì ở các nền tảng Maps thông thường?
              </h2>
              <div className="space-y-4 text-sm leading-relaxed text-cream/80 sm:text-base">
                <p>
                  Khác với các ứng dụng bản đồ phổ biến vốn tập trung vào việc
                  tìm tuyến đường di chuyển từ A đến B ngắn nhất trong đô thị,{" "}
                  <strong className="text-cream">Mỳ Gõ Map</strong> tập trung
                  giải quyết bài toán trải nghiệm trên những chuyến đi xa:
                </p>
                <ul className="list-disc space-y-2 pl-5 text-cream/80">
                  <li>
                    <strong className="text-cream">
                      Gợi ý thông minh dọc tuyến đường:
                    </strong>{" "}
                    Tự động tìm kiếm trạm xăng, quán nghỉ, quán cà phê và quán
                    ăn ngay sát trục lộ trình mà không làm gián đoạn hướng đi
                    chính.
                  </li>
                  <li>
                    <strong className="text-cream">
                      Tối ưu cho chuyến đi phượt & Road-trip:
                    </strong>{" "}
                    Giúp người dùng tính toán khoảng cách giữa các trạm dừng để
                    chủ động nạp nhiên liệu và nghỉ ngơi hợp lý.
                  </li>
                  <li>
                    <strong className="text-cream">
                      Trải nghiệm cá nhân hóa nhẹ nhàng:
                    </strong>{" "}
                    Nhận diện danh xưng, lưu trữ trải nghiệm di chuyển cá nhân
                    hoàn toàn trên trình duyệt của bạn mà không cần đăng ký tài
                    khoản phức tạp.
                  </li>
                </ul>
              </div>
            </section>

            {/* Section 2: Đang hoàn thiện */}
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-amber-400 flex items-center gap-2 sm:text-2xl">
                Dự án đang trong giai đoạn hoàn thiện
              </h2>
              <p className="text-sm leading-relaxed text-cream/80 sm:text-base">
                Mỳ Gõ Map vẫn đang trong quá trình thử nghiệm và phát triển liên
                tục, do đó không thể tránh khỏi một số hạn chế kỹ thuật:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-cream/70 sm:text-base">
                <li>
                  Ứng dụng vẫn có thể phát sinh lỗi hệ thống hoặc đứng máy trong
                  một số thao tác tìm kiếm phức tạp.
                </li>
                <li>
                  Các địa chỉ hoặc tọa độ nằm sát khu vực biên giới, vùng
                  biển/hải đảo hiện chưa được đồng bộ hoàn toàn dữ liệu địa
                  giới, có thể gây ra hiện tượng không phản hồi hoặc văng lỗi
                  (crash).
                </li>
                <li>
                  Đội ngũ phát triển đang tích cực nâng cấp hệ thống máy chủ và
                  xử lý dữ liệu để khắc phục những sự sự cố này trong các bản
                  cập nhật tiếp theo.
                </li>
              </ul>
            </section>

            {/* Section 3: Tôi yêu Việt Nam */}
            <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-rose-400 flex items-center gap-2 sm:text-2xl">
                Tinh thần Tôi yêu Việt Nam
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-cream/80 sm:text-base">
                <p>
                  Đội ngũ phát triển Mỳ Gõ Map luôn kiên định với tinh thần
                  khẳng định và bảo vệ chủ quyền lãnh thổ thiêng liêng của Việt
                  Nam.
                </p>
                <p>
                  Hiện nay, dù có nhiều bằng chứng lịch sử và pháp lý vững chắc
                  chứng minh chủ quyền của Việt Nam từ xa xưa đối với các quần
                  đảo và vùng biển đảo, một số dữ liệu hình ảnh bản đồ nguồn mở
                  thuộc bên thứ ba vẫn còn tồn tại các sai lệch hoặc bị can
                  thiệp trái phép.
                </p>
                <p>
                  Mặc dù hệ thống kỹ thuật hiện tại chưa thể che phủ hoặc thay
                  thế hoàn toàn 100% tất cả các lớp hình ảnh nền từ nhà cung cấp
                  toàn cầu, chúng tôi cam kết luôn nỗ lực hết mình để lọc, điều
                  chỉnh và ưu tiên các nguồn dữ liệu chuẩn xác nhất — hướng tới
                  một bản đồ số hoàn thiện tôn vinh trọn vẹn lãnh thổ Việt Nam.
                </p>
              </div>
            </section>

            {/* Section 4: Các hạn chế kỹ thuật hiện tại */}
            <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 backdrop-blur-md sm:p-8">
              <h2 className="mb-4 text-xl font-bold text-red-600 flex items-center gap-2 sm:text-2xl">
                Các điểm yếu & Hạn chế hiện tại
              </h2>
              <p className="text-sm leading-relaxed text-cream/80 sm:text-base">
                Để người dùng có trải nghiệm minh bạch nhất, chúng tôi xin công
                khai một số hạn chế kỹ thuật đang trong quá trình tối ưu:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-cream/70 sm:text-base">
                <li>
                  <strong className="text-cream">Giới hạn điểm dừng:</strong> Hệ
                  thống hiện chỉ hỗ trợ tối đa 10 điểm dừng cho mỗi chuyến đi.
                </li>
                <li>
                  <strong className="text-cream">Tốc độ phản hồi:</strong> Thời
                  gian phản hồi còn tương đối lâu, đôi khi có thể xảy ra lỗi
                  hoặc chậm; bạn có thể cần thực hiện lại thao tác.
                </li>
                <li>
                  <strong className="text-cream">
                    Hạn chế công cụ Tìm kiếm:
                  </strong>{" "}
                  Tìm kiếm địa điểm hiện hoạt động ổn định nhất theo tên tỉnh và
                  thành phố. Các dữ liệu chi tiết hơn như tên đường, số nhà có
                  thể chưa tra cứu chính xác hoặc chưa ra kết quả.
                </li>
                <li>
                  <strong className="text-cream">Trải nghiệm giao diện:</strong>{" "}
                  Thao tác cuộn/phóng to bản đồ chưa thật sự mượt mà và chỉ mang
                  tính tương đối, vẫn còn tình trạng giật lag trên một số thiết
                  bị.
                </li>
                <li>
                  <strong className="text-cream">Yêu cầu đường truyền:</strong>{" "}
                  Ứng dụng đòi hỏi kết nối Internet chất lượng cao và ổn định để
                  hoạt động tốt nhất, nếu mạng yếu hệ thống sẽ xử lý rất chậm.
                </li>
              </ul>
            </section>

            {/* Chú thích thêm dẫn sang Google Maps */}
            <div className="pt-2 text-md leading-relaxed text-red-600">
              * LƯU Ý: Nếu bạn không hài lòng về hệ thống thì vui lòng cút sang
              GoogleMaps <br /> Tôi để sẵn link để bạn đỡ phải gõ:{" "}
              <a
                href="https://www.google.com/maps"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-accent-gold hover:underline inline-flex items-center gap-1"
              >
                Google Maps
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
              .
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
