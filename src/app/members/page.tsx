import Image from "next/image";

// Danh sách thành viên phát triển dự án
const TEAM_MEMBERS = [
  {
    name: "Nguyễn Hoàng Điền",
    role: "Lead Developer & System Architect",
    avatar: "/assets/DienAVA.jpg", // Bạn có thể thay bằng đường dẫn ảnh cá nhân (ví dụ: /assets/dien.jpg)
    description:
      "Phụ trách thiết kế hệ thống, kiến trúc ứng dụng và phát triển các tính năng cốt lõi cho Mỳ Gõ Map.",
    isHuman: true,
  },
  {
    name: "Claude",
    role: "AI Co-pilot & UI Design Assistant",
    avatar: "/assets/claude.png",
    description:
      "Hỗ trợ viết mã nguồn, tối ưu hóa giao diện người dùng và tinh chỉnh cấu trúc trải nghiệm UX/UI.",
    isHuman: false,
  },
  {
    name: "Codex",
    role: "AI Code Generation Partner",
    avatar: "/assets/codex.png",
    description:
      "Trợ lý viết code tự động, hỗ trợ tái cấu trúc logic và tối ưu hóa hiệu năng các thuật toán định vị.",
    isHuman: false,
  },
  {
    name: "Gemini",
    role: "AI Reasoning & Content Assistant",
    avatar: "/assets/gemini.png",
    description:
      "Hỗ trợ phân tích dữ liệu địa lý, biên tập nội dung bài viết và tư vấn giải pháp xử lý dữ liệu.",
    isHuman: false,
  },
  {
    name: "ChatGPT",
    role: "AI Technical Advisor",
    avatar: "/assets/chatgpt.png",
    description:
      "Tư vấn giải pháp công nghệ, hỗ trợ sửa lỗi (debug) và đề xuất phương án tối ưu hóa hệ thống.",
    isHuman: false,
  },
  {
    name: "Kiro IDE",
    role: "AI-Powered Development Environment",
    avatar: "/assets/kiro.png",
    description:
      "Môi trường lập trình tích hợp AI thông minh, giúp tăng tốc độ triển khai và quản lý dự án.",
    isHuman: false,
  },
];

export default function MembersPage() {
  return (
    <div className="relative h-screen overflow-hidden bg-ink text-cream">
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
        <div className="max-w-full">
          {/* Tiêu đề trang */}
          <div className="mb-10 text-left max-w-2xl lg:max-w-3xl">
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

          {/* Danh sách thành viên hiển thị dạng Grid 3 cột */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEAM_MEMBERS.map((member) => (
              <section
                key={member.name}
                className={`flex flex-col rounded-2xl border p-6 backdrop-blur-md transition-all duration-300 hover:border-cream/20 sm:p-7 ${
                  member.isHuman
                    ? "border-primary/30 bg-primary/10 shadow-lg shadow-primary/5"
                    : "border-cream/10 bg-white/5"
                }`}
              >
                <div className="flex flex-col items-center text-center gap-4">
                  {/* Avatar */}
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-orange-100 p-1">
                    <Image
                      src={member.avatar}
                      alt={member.name}
                      fill
                      unoptimized
                      className="object-cover rounded-xl"
                    />
                  </div>

                  {/* Thông tin */}
                  <div className="space-y-1.5 w-full">
                    <div className="flex items-center justify-center gap-2.5">
                      <h2 className="text-xl font-bold text-cream">
                        {member.name}
                      </h2>
                      {member.isHuman ? (
                        <span className="rounded-full bg-primary/20 border border-primary/30 px-2.5 py-0.5 text-xs font-semibold text-accent-gold">
                          Human
                        </span>
                      ) : (
                        <span className="rounded-full bg-white/10 border border-white/10 px-2.5 py-0.5 text-xs font-medium text-cream/60">
                          AI Partner
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold tracking-wide text-primary sm:text-sm">
                      {member.role}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-cream/75">
                      {member.description}
                    </p>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
