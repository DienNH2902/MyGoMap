// "use client";

// import { useEffect } from "react";

// export function LocationRequest() {
//   useEffect(() => {
//     if ("geolocation" in navigator) {
//       navigator.geolocation.getCurrentPosition(
//         () => {},
//         (error) => console.warn("Không thể lấy vị trí:", error.message),
//       );
//     }
//   }, []);

//   return null;
// }

"use client";

/**
 * ĐÃ TẮT: component này trước đây gọi `navigator.geolocation.getCurrentPosition()`
 * ngay khi vào TRANG CHỦ — tức là xin quyền vị trí "trắng trơn", chưa có ngữ
 * cảnh gì để người dùng hiểu vì sao trang cần biết vị trí của họ.
 *
 * Đây là nguyên nhân chính khiến định vị "không hoạt động trên mobile" dù
 * hoạt động tốt trên web/desktop: trên mobile, hộp thoại xin quyền là modal
 * toàn màn hình bắt buộc chọn Cho phép/Từ chối ngay lập tức — người dùng có
 * xu hướng bấm "Từ chối" theo phản xạ khi bị hỏi đường đột như vậy. Một khi
 * đã từ chối, trình duyệt sẽ KHÔNG BAO GIỜ tự hiện lại hộp thoại đó nữa cho
 * trang này (JS không thể ép hỏi lại), nên khi người dùng vào trang bản đồ
 * thật sự cần định vị, GeolocateControl ở đó gọi lại cũng lập tức bị từ chối
 * ngay từ đầu — và trước đây không có gì báo lỗi cho người dùng biết, nên
 * nhìn như "định vị hỏng" một cách bí ẩn.
 *
 * Cách đúng: chỉ xin quyền vị trí ĐÚNG LÚC người dùng thật sự cần nó (khi họ
 * đã ở trang bản đồ và bấm dùng định vị) — việc này đã được xử lý trong
 * MapView.tsx (GeolocateControl.trigger() khi bản đồ load xong), kèm thông
 * báo lỗi rõ ràng nếu bị từ chối/timeout/thiếu HTTPS.
 */
export function LocationRequest() {
  return null;
}
