"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface CommitData {
  sha: string;
  message: string;
  authorName: string;
  authorAvatar?: string;
  updatedAt: string;
  htmlUrl: string;
}

const ITEMS_PER_PAGE = 10;

// Hàm định dạng ngày giờ theo chuẩn Việt Nam
function formatVietnamDate(value: string) {
  try {
    const formatted = new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(value));
    return formatted.replace("lúc ", " ");
  } catch {
    return value;
  }
}

export default function ChangelogPage() {
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // State quản lý trang hiện tại
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    async function fetchGitHubCommits() {
      try {
        setIsLoading(true);
        // Tải 50 commits gần nhất để xử lý phân trang client-side mượt mà
        const res = await fetch(
          "https://api.github.com/repos/DienNH2902/MyGoMap/commits?per_page=50",
        );

        if (!res.ok) {
          throw new Error("Không thể tải dữ liệu commit từ GitHub API");
        }

        const data = await res.json();

        const mappedCommits: CommitData[] = data.map((item: any) => ({
          sha: item.sha,
          message: item.commit.message,
          authorName: item.commit.author.name,
          authorAvatar: item.author?.avatar_url,
          updatedAt: item.commit.author.date,
          htmlUrl: item.html_url,
        }));

        setCommits(mappedCommits);
      } catch (err: any) {
        setError(err.message || "Đã xảy ra lỗi khi tải lịch sử cập nhật.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchGitHubCommits();
  }, []);

  // Tính toán dữ liệu hiển thị theo trang
  const totalPages = Math.ceil(commits.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentCommits = commits.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

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
              Nhật ký phát triển
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-cream sm:text-4xl">
              Lịch sử cập nhật{" "}
              <span className="bg-gradient-to-r from-primary via-accent-gold to-primary bg-clip-text text-transparent">
                Mỳ Gõ Map
              </span>
            </h1>
            <p className="mt-4 text-base leading-relaxed text-cream/80 sm:text-lg">
              Theo dõi danh sách các thay đổi, tính năng mới và bản sửa lỗi được
              đẩy trực tiếp từ GitHub Repository của dự án.
            </p>
          </div>

          {/* Nội dung Bảng danh sách Commit */}
          <div className="space-y-8">
            <section className="rounded-2xl border border-cream/10 bg-white/5 p-6 backdrop-blur-md sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary flex items-center gap-2 sm:text-2xl">
                  Danh sách Cập nhật mới nhất
                </h2>
                {/* <a
                  href="https://github.com/DienNH2902/MyGoMap/commits"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-accent-gold hover:underline flex items-center gap-1"
                >
                  Xem tất cả trên GitHub ↗
                </a> */}
              </div>

              {isLoading ? (
                <div className="py-12 text-center text-cream/60 font-mono text-sm">
                  Đang tải lịch sử commit từ GitHub...
                </div>
              ) : error ? (
                <div className="py-8 text-center text-rose-400 text-sm bg-rose-500/10 rounded-xl border border-rose-500/20">
                  {error}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-cream/80">
                      <thead className="border-b border-cream/10 text-xs uppercase tracking-wider text-accent-gold">
                        <tr>
                          <th
                            scope="col"
                            className="pb-3 pr-4 font-semibold w-24"
                          >
                            Cập nhật
                          </th>
                          <th scope="col" className="pb-3 px-4 font-semibold">
                            Nội dung thay đổi (Message)
                          </th>
                          <th
                            scope="col"
                            className="pb-3 px-4 font-semibold w-40"
                          >
                            Tác giả
                          </th>
                          <th
                            scope="col"
                            className="pb-3 pl-4 font-semibold w-44 text-right"
                          >
                            Thời gian
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-cream/5">
                        {currentCommits.map((item) => {
                          const shortSha = item.sha.slice(0, 7);
                          const firstLineMessage = item.message.split("\n")[0];

                          return (
                            <tr
                              key={item.sha}
                              className="hover:bg-white/5 transition-colors group"
                            >
                              <td className="py-4 pr-4 font-mono text-xs font-semibold align-top">
                                <a
                                  href={item.htmlUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block rounded-md bg-white/10 px-2 py-1 text-accent-gold hover:bg-accent-gold hover:text-ink transition"
                                >
                                  {shortSha}
                                </a>
                              </td>
                              <td className="py-4 px-4 text-cream font-medium leading-relaxed align-top">
                                <p className="whitespace-pre-line">
                                  {firstLineMessage}
                                </p>
                                {item.message.split("\n").length > 1 && (
                                  <p className="mt-1 text-xs text-cream/50 line-clamp-2">
                                    {item.message
                                      .split("\n")
                                      .slice(1)
                                      .join(" ")
                                      .trim()}
                                  </p>
                                )}
                              </td>
                              <td className="py-4 px-4 text-xs text-cream/80 align-top whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  {item.authorAvatar && (
                                    <Image
                                      src={item.authorAvatar}
                                      alt={item.authorName}
                                      width={20}
                                      height={20}
                                      unoptimized
                                      className="rounded-full"
                                    />
                                  )}
                                  <span>{item.authorName}</span>
                                </div>
                              </td>
                              <td className="py-4 pl-4 text-xs text-cream/60 text-right align-top whitespace-nowrap font-mono">
                                {formatVietnamDate(item.updatedAt)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Thanh Phân Trang (Pagination Controls) */}
                  <div className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-cream/10 pt-4 sm:flex-row">
                    <span className="text-xs font-mono text-cream/60">
                      Hiển thị {startIndex + 1} -{" "}
                      {Math.min(startIndex + ITEMS_PER_PAGE, commits.length)}{" "}
                      trên tổng số {commits.length} commits
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="rounded-lg border border-cream/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 transition"
                      >
                        ← Trang trước
                      </button>

                      <div className="flex items-center gap-1 px-2 text-xs font-mono text-accent-gold">
                        <span>{currentPage}</span>
                        <span className="text-cream/40">/</span>
                        <span>{totalPages}</span>
                      </div>

                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="rounded-lg border border-cream/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-cream hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40 transition"
                      >
                        Trang sau →
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
