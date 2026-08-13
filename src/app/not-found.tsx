"use client";

import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-surface-muted md:flex-row">
      {/* Màn hình bên trái: Hình ảnh đại diện */}
      <div className="relative flex min-h-[40vh] w-full items-center justify-end overflow-hidden bg-surface-muted p-6 md:min-h-screen md:w-1/2">
        <div className="absolute inset-0 bg-surface-muted" />
        <div className="relative h-64 w-64 md:h-96 md:w-96 overflow-hidden rounded-xl">
          <Image
            src="/assets/Not found.png"
            alt="Mèo xám hướng dẫn"
            fill
            sizes="1200"
            priority
            className="object-cover bg-surface-muted"
          />
        </div>
      </div>

      {/* Màn hình bên phải: Nội dung bóng lời nói (Speech Bubble) */}
      <div className="flex w-full items-center justify-start p-6 md:w-1/2 md:p-12">
        <div className="relative w-full max-w-lg rounded-3xl bg-white p-8 shadow-xl md:p-10">
          {/* Mũi tên chỉ sang bên trái dành cho màn hình Desktop */}
          <div className="absolute -left-4 top-1/2 hidden h-0 w-0 -translate-y-1/2 border-y-[16px] border-r-[20px] border-y-transparent border-r-white md:block" />

          {/* Mũi tên chỉ lên trên dành cho màn hình Mobile */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 h-0 w-0 border-x-[16px] border-b-[20px] border-x-transparent border-b-white md:hidden" />

          <div className="flex flex-col gap-4 text-slate-800">
            <span className="inline-block w-fit rounded-xl bg-amber-100 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-800">
              Lỗi 404 | NOT FOUND
            </span>

            <h1 className="text-2xl font-black tracking-tight text-slate-900 md:text-3xl">
              Trang không tồn tại
            </h1>

            <p className="text-base leading-relaxed text-slate-600">
              Bạn đang cố gắng truy cập bậy bạ gì vậy?
            </p>

            <div className="mt-4 pt-2">
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-xl bg-orange-400 px-6 py-3.5 text-center font-bold text-white shadow-lg transition-all hover:bg-amber-600 hover:shadow-amber-500/25 active:scale-95"
              >
                Quay lại trang chủ
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
