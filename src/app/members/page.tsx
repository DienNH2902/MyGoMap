import Image from "next/image";

// Danh sách thành viên phát triển dự án
const TEAM_MEMBERS = [
  {
    name: "Nguyễn Hoàng Điền",
    role: "Trưởng nhóm & Kiến trúc sư Hệ thống",
    avatar: "/assets/DienAVA.jpg",
    description:
      "Phụ trách thiết kế hệ thống, kiến trúc ứng dụng và phát triển các tính năng cốt lõi cho Mỳ Gõ Map.",
    isHuman: true,
  },
  {
    name: "Claude",
    role: "Đối tác Lập trình & Viết Mã Nguồn AI",
    avatar: "/assets/claude.png",
    description:
      "Chịu trách nhiệm viết mã nguồn, tối ưu hóa giao diện người dùng và tinh chỉnh cấu trúc UX/UI. Rất năng nổ nhưng dễ mệt và ngủ giữa chừng.",
    isHuman: false,
  },
  {
    name: "Codex",
    role: "Đối tác Lập trình & Tối ưu Logic AI",
    avatar: "/assets/codex.png",
    description:
      "Hỗ trợ tái cấu trúc logic và tối ưu hóa thuật toán định vị khi Claude đã ngủ. Đưa ra các phương án hiệu quả nhưng ngủ nhiều hơn Claude.",
    isHuman: false,
  },
  {
    name: "Gemini",
    role: "Trợ lý Suy luận & Biên tập Nội dung AI",
    avatar: "/assets/gemini.png",
    description:
      "Giải đáp thắc mắc, biên tập và tư vấn giải pháp. Hay vất vả sửa lỗi do Codex và Claude gây ra, thường xuyên mất ngủ nên bị lợi dụng nhiều.",
    isHuman: false,
  },
  {
    name: "ChatGPT",
    role: "Cố vấn Kỹ thuật & Sửa lỗi AI",
    avatar: "/assets/chatgpt.png",
    description:
      "Hỗ trợ sửa lỗi (debug) và đề xuất phương án tối ưu hóa hệ thống. Hay đề xuất giải pháp sáng tạo nhưng luôn đề xuất sai.",
    isHuman: false,
  },
  {
    name: "Kiro IDE",
    role: "Môi trường Phát triển Tích hợp AI",
    avatar: "/assets/kiro.png",
    description:
      "Môi trường lập trình tích hợp AI thông minh, giúp tăng tốc độ triển khai và quản lý dự án mỗi khi các thành viên khác ngủ.",
    isHuman: false,
  },
];

export default function MembersPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-ink text-cream">
      {/* Background Ảnh nền định vị cố định bên phải, làm mờ nhẹ */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-end">
        <div className="relative h-full w-full lg:w-3/4 opacity-20 blur-[1px]">
          <Image
            src="/assets/vnbg.png"
            alt="MyGoMap Vietnam Background"
            fill
            priority
            unoptimized
            className="object-contain object-center"
          />
        </div>
      </div>

      {/* Lớp phủ Gradient tối giúp tăng độ tương phản đọc chữ */}
      <div className="fixed inset-0 z-0 bg-gradient-to-r from-ink via-ink/90 to-transparent pointer-events-none" />

      {/* Nội dung chính */}
      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-28 pb-20">
        <div className="max-w-full">
          {/* Tiêu đề trang */}
          <div className="mb-12 text-left max-w-2xl lg:max-w-3xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent-gold">
              Đội ngũ dự án
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
              Thành viên phát triển{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                Mỳ Gõ Map
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-cream/80 sm:text-lg">
              Dự án Mỳ Gõ Map là sản phẩm kết hợp giữa tư duy sáng tạo của lập
              trình viên và sức mạnh hỗ trợ vượt trội từ các công cụ trí tuệ
              nhân tạo thế hệ mới.
            </p>
          </div>

          {/* Grid danh sách thành viên */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEAM_MEMBERS.map((member) => (
              <section
                key={member.name}
                className={`group relative flex flex-col justify-between rounded-2xl border p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 ${
                  member.isHuman
                    ? "border-primary/40 bg-gradient-to-b from-primary/15 via-primary/5 to-transparent shadow-lg shadow-primary/10 hover:border-primary/70 hover:shadow-primary/20"
                    : "border-cream/10 bg-white/[0.03] hover:border-cream/25 hover:bg-white/[0.06]"
                }`}
              >
                {/* Viền sáng trên đỉnh Card khi hover */}
                <div
                  className={`absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r transition-opacity duration-300 ${
                    member.isHuman
                      ? "from-transparent via-primary/60 to-transparent opacity-100"
                      : "from-transparent via-accent-gold/40 to-transparent opacity-0 group-hover:opacity-100"
                  }`}
                />

                <div className="flex flex-col gap-5">
                  {/* Header trong Card: Avatar + Tên & Role */}
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div
                      className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border p-1 transition-transform duration-300 group-hover:scale-105 ${
                        member.isHuman
                          ? "border-primary/50 bg-primary/20 shadow-md shadow-primary/20"
                          : "border-white/10 bg-orange-100"
                      }`}
                    >
                      <Image
                        src={member.avatar}
                        alt={member.name}
                        fill
                        unoptimized
                        className="object-cover rounded-xl"
                      />
                    </div>

                    {/* Tên & Tác vụ */}
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold text-cream truncate">
                          {member.name}
                        </h2>
                        {member.isHuman ? (
                          <span className="inline-flex items-center rounded-full bg-primary/20 border border-primary/40 px-2 py-0.5 text-[10px] font-bold text-accent-gold uppercase tracking-wider">
                            Leader
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-white/10 border border-white/10 px-2 py-0.5 text-[10px] font-medium text-cream/60 uppercase tracking-wider">
                            Thành viên
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold leading-snug text-accent-gold/90">
                        {member.role}
                      </p>
                    </div>
                  </div>

                  {/* Mô tả chi tiết */}
                  <p className="text-xs leading-relaxed text-cream/75 sm:text-sm">
                    {member.description}
                  </p>
                </div>

                {/* Footer điểm nhấn nhẹ dưới Card */}
                <div className="mt-6 border-t border-white/5 pt-3 flex justify-between items-center text-[11px] font-mono text-cream/40">
                  <span>{member.isHuman ? "Nhà phát triển" : "Khách mời"}</span>
                  <span className="group-hover:text-accent-gold transition-colors">
                    #MyGoMapTeam
                  </span>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
