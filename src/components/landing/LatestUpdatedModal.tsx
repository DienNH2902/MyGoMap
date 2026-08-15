"use client";

import { useEffect, useState } from "react";

interface LatestUpdatedModalProps {
  sha: string;
  message: string;
  authorName: string;
  updatedAt: string;
}

function formatVietnamDate(value: string) {
  const formatted = new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "full",
    timeStyle: "medium",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));

  return formatted.replace("lúc ", " ");
}

export function LatestUpdatedModal({
  sha,
  message,
  authorName,
  updatedAt,
}: LatestUpdatedModalProps) {
  const [isOpen, setIsOpen] = useState(false);

  const shortSha = sha.slice(0, 7);
  const firstLine = message.split("\n")[0];

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-30 max-w-xs rounded-2xl border border-cream/10 bg-ink/85 px-4 py-3 text-left text-xs text-cream/70 shadow-2xl backdrop-blur-md transition hover:border-accent-gold/40 hover:bg-ink"
      >
        <p className="mb-1 font-semibold uppercase tracking-wide text-accent-gold">
          Latest updated
        </p>
        <p className="mt-1 text-cream/45">{formatVietnamDate(updatedAt)}</p>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-cream/10 bg-ink p-5 text-cream shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-accent-gold">
                  Latest updated
                </p>
                <h2 className="mt-1 text-lg font-bold text-cream">
                  Cập nhật mới nhất
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-cream/50 transition hover:bg-white/10 hover:text-cream"
                aria-label="Đóng modal"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cream/40">
                  Thời gian
                </p>
                <p className="mt-1 text-cream">
                  {formatVietnamDate(updatedAt)}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cream/40">
                  Commit message
                </p>
                <p className="mt-1 whitespace-pre-line rounded-xl bg-white/5 p-3 leading-relaxed text-cream/85">
                  {message}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-cream/40">
                    Author
                  </p>
                  <p className="mt-1 text-cream/80">{authorName}</p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-cream/40">
                    Commit
                  </p>
                  <p className="mt-1 font-mono text-cream/80">{shortSha}</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="mt-5 w-full rounded-xl bg-accent-gold px-4 py-2.5 text-sm font-bold text-ink transition hover:brightness-105"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </>
  );
}
