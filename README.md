# MyGoMap

Ứng dụng lập lộ trình chạy **100% ở Frontend** (Next.js + TypeScript), không cần backend,
không mất phí ở quy mô thử nghiệm/đồ án. Gõ điểm xuất phát và điểm đến, chọn số điểm dừng
và loại địa điểm cần gợi ý (trạm xăng, trạm dừng chân, quán ăn, cà phê...), MyGoMap sẽ vẽ
lộ trình lái xe thực tế và tự gợi ý các địa điểm phù hợp dọc đường.

## Công nghệ sử dụng (toàn bộ miễn phí)

| Chức năng | Công nghệ | Ghi chú |
|---|---|---|
| Nền tảng | Next.js 14 (App Router) + TypeScript strict | Không dùng `any` |
| Giao diện | Tailwind CSS | Không viết CSS/SCSS thuần |
| Bản đồ nền | MapLibre GL JS + CARTO free vector style | Không cần key |
| Tìm đường | OpenRouteService (`driving-car`) | Cần API key miễn phí |
| Tìm địa chỉ | Nominatim (OpenStreetMap) | Không cần key |
| Dữ liệu địa điểm (trạm xăng, quán ăn...) | Overpass API (OpenStreetMap) | Không cần key |
| Thuật toán chia điểm dừng | Turf.js (`turf.along`, `turf.length`, `turf.distance`) | Chạy hoàn toàn ở trình duyệt, tự do chỉnh sửa tiêu chí |
| Gợi ý AI (tuỳ chọn) | Gemini 2.5 Flash (free tier) | Không có key vẫn chạy bình thường, chỉ ẩn phần gợi ý |

## 1. Cài đặt

```bash
npm install
```

## 2. Lấy API key miễn phí

Sao chép file mẫu:

```bash
cp .env.local.example .env.local
```

Rồi điền vào `.env.local`:

- **`NEXT_PUBLIC_ORS_API_KEY`** *(bắt buộc)* — đăng ký miễn phí tại
  https://openrouteservice.org/dev/#/signup (không cần thẻ). Free tier: khoảng
  2.000 request/ngày, 40 request/phút — thoải mái cho đồ án.
- **`NEXT_PUBLIC_GEMINI_API_KEY`** *(tuỳ chọn)* — lấy miễn phí tại
  https://aistudio.google.com/apikey, dùng cho khung gợi ý AI nhỏ ở góc bản đồ.
  Bỏ trống thì ứng dụng vẫn chạy đầy đủ, chỉ không có gợi ý AI.

## 3. Chạy dự án (localhost:3000)

```bash
npm run dev
```

Mở http://localhost:3000 — trang chào mừng sẽ hiện ra, bấm "Bắt đầu hành trình" để vào
`/map`, nơi diễn ra toàn bộ việc lập lộ trình.

## Cấu trúc thư mục

```
src/
├── app/                     # Next.js App Router
│   ├── layout.tsx           # Font, metadata, layout gốc
│   ├── page.tsx             # Trang chào mừng (landing)
│   ├── globals.css          # Chỉ chứa @tailwind directives
│   └── map/page.tsx         # Trang lập lộ trình chính
├── components/
│   ├── landing/              # Hero chào mừng + hiệu ứng SVG chữ ký
│   ├── layout/                # Header dùng chung
│   ├── map/                   # Bản đồ, panel nhập liệu, chip filter, drawer chi tiết
│   └── ui/                    # Button, NumberStepper, LoadingSpinner dùng chung
├── hooks/
│   ├── useRoutePlanner.ts    # "Bộ não" của app: gọi routing -> chia điểm dừng -> tìm POI -> AI tip
│   └── useDebouncedValue.ts  # Debounce ô tìm kiếm
└── lib/
    ├── constants.ts           # Endpoint API, bảng danh mục địa điểm (POI_CATEGORIES)
    ├── types.ts                # Toàn bộ type dùng chung
    ├── geo/turfHelpers.ts      # Thuật toán chia điểm dừng đều trên tuyến đường (Turf.js)
    ├── routing/openRouteService.ts
    ├── geocoding/nominatim.ts
    ├── overpass/overpassClient.ts
    └── ai/geminiClient.ts
```

## Cách thuật toán gợi ý điểm dừng hoạt động

1. `openRouteService.ts` lấy toàn bộ toạ độ tuyến đường lái xe thật giữa điểm A và B.
2. `turfHelpers.getEvenlySpacedStopPoints()` chia tuyến đường thành N điểm cách đều nhau
   theo đúng số điểm dừng người dùng chọn (đây là nơi bạn có thể tự thay đổi tiêu chí chia,
   ví dụ chia theo mốc 50km/100km cố định thay vì chia đều).
3. Với mỗi điểm dừng, `overpassClient.findPoisNearPoint()` quét bán kính 8km (nằm trong
   khoảng 5–10km theo yêu cầu) để tìm các địa điểm thực tế khớp danh mục người dùng chọn.
4. Kết quả được sắp xếp theo khoảng cách và giới hạn số lượng mỗi danh mục — bạn có thể
   chỉnh `MAX_POIS_PER_CATEGORY_PER_STOP` hoặc thêm tiêu chí lọc riêng (giờ mở cửa, đánh
   giá...) ngay trong file này.
5. Tuỳ chọn: `geminiClient.generateTripTip()` gửi tóm tắt chuyến đi cho Gemini để viết một
   câu gợi ý ngắn, thân thiện.

Muốn thêm danh mục địa điểm mới (ví dụ "Siêu thị", "Chợ đêm"...)? Chỉ cần thêm một dòng vào
mảng `POI_CATEGORIES` trong `src/lib/constants.ts` với tag OSM tương ứng — không cần đụng
tới logic tìm kiếm.

## Giới hạn cần lưu ý ở free tier

- **OpenRouteService**: ~2.000 request/ngày, 40 request/phút cho tài khoản miễn phí.
- **Nominatim**: khuyến nghị tối đa ~1 request/giây, chỉ dùng cho khối lượng nhỏ (đã có
  debounce 400ms sẵn trong `PlaceAutocompleteInput`).
- **Overpass API**: máy chủ công cộng, giới hạn theo tải chung ("fair use"), không có hạn
  mức cứng nhưng không nên gọi dồn dập.
- **Ảnh địa điểm**: OpenStreetMap chỉ có ảnh cho một số ít địa điểm (tag `image`), nên phần
  lớn thẻ chi tiết sẽ hiển thị icon danh mục thay vì ảnh thật — đây là giới hạn của nguồn dữ
  liệu miễn phí, không phải lỗi ứng dụng.
- **Gemini free tier**: model Flash hiện còn miễn phí (Pro đã bị gỡ khỏi free tier từ 4/2026),
  khoảng 1.500 request/ngày — quá đủ vì app chỉ gọi 1 lần mỗi khi lập lộ trình mới.

## Build production

```bash
npm run build
npm run start
```
