import type { PoiCategoryDefinition } from "./types";

export type MapStyleId =
  | "standard"
  | "topo"
  | "outdoor"
  | "satellite"
  | "street"
  | "openStreet";

/**
 * Every external service below is free and requires no backend:
 * - OpenRouteService: free driving-route API (needs a free personal API key).
 * - Nominatim: free OSM geocoding (search-by-address), no key needed.
 * - Overpass API: free OSM data queries (points of interest), no key needed.
 * - CARTO basemap style: free vector tiles, no key needed, safe for light production use
 *   (unlike the raw tile.openstreetmap.org server, which explicitly disallows app usage).
 */
/**
 * ORS chỉ dùng "driving-car" — cho CẢ ô tô lẫn xe máy. (Trước đây có thử
 * dùng profile "cycling-regular" để ép né cao tốc cho xe máy, nhưng đó là
 * SAI: cycling-regular là đồ thị đường DÀNH CHO XE ĐẠP — tốc độ, luật đi
 * đường, và các đoạn đường được phép đi đều không đúng cho xe máy có động
 * cơ. Đã bỏ hướng đó. Giờ ORS chỉ đóng vai trò:
 * 1) Định tuyến chính cho Ô TÔ (ưu tiên cao tốc tự nhiên qua preference
 *    "fastest" mặc định, không cần cấu hình thêm).
 * 2) Phương án DỰ PHÒNG cho XE MÁY khi TomTom lỗi/thiếu key — xem
 *    fetchDrivingRoute trong openRouteService.ts. Phương án chính cho xe máy
 *    là TomTom (travelMode=motorcycle), vì đó là API DUY NHẤT trong dự án có
 *    đúng profile xe 2 bánh có động cơ thật.
 */
export const ORS_DIRECTIONS_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
export const NOMINATIM_SEARCH_URL =
  "https://nominatim.openstreetmap.org/search";
export const OVERPASS_INTERPRETER_URL =
  "https://overpass-api.de/api/interpreter";
export const MAP_STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export const MAP_STYLES: Record<MapStyleId, MapStyleDefinition> = {
  standard: {
    id: "standard",
    label: "Thường",
    description: "Bản đồ sáng, dễ nhìn cho tìm đường.",
    url: MAP_STYLE_URL,
  },
  topo: {
    id: "topo",
    label: "Địa hình",
    description: "Bản đồ địa hình/topographic có đường đồng mức.",
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/01a023c1-2c97-7964-b39a-bb8767f2e6e4/style.json?key=${MAPTILER_KEY}`
      : MAP_STYLE_URL,
    needsMapTilerKey: true,
  },
  outdoor: {
    id: "outdoor",
    label: "Outdoor",
    description: "Bản đồ ngoài trời, phù hợp xem núi/đèo/đường xa.",
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/01a023c2-444f-7a09-bce3-899cff448cc0/style.json?key=${MAPTILER_KEY}`
      : MAP_STYLE_URL,
    needsMapTilerKey: true,
  },
  satellite: {
    id: "satellite",
    label: "Vệ tinh",
    description: "Bản đồ vệ tinh, giúp góc nhìn thực tế.",
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/01a023b7-c674-7b59-b79a-b9d9b045fd56/style.json?key=${MAPTILER_KEY}`
      : MAP_STYLE_URL,
    needsMapTilerKey: true,
  },
  street: {
    id: "street",
    label: "Bản đồ",
    description: "Bản đồ đường đi, giúp góc nhìn thực tế.",
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/01a023bd-e26a-71e3-95b4-3335b9e4b6aa/style.json?key=${MAPTILER_KEY}`
      : MAP_STYLE_URL,
    needsMapTilerKey: true,
  },
  openStreet: {
    id: "openStreet",
    label: "Đường",
    description: "Bản đồ mở đường đi, giúp góc nhìn thực tế.",
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/01a023c3-a272-7ff4-8a15-75dcca316c05/style.json?key=${MAPTILER_KEY}`
      : MAP_STYLE_URL,
    needsMapTilerKey: true,
  },
};

export function hasMapStyleProviderKey(styleId: MapStyleId): boolean {
  const style = MAP_STYLES[styleId];
  if (!style.needsMapTilerKey) return true;
  return Boolean(MAPTILER_KEY);
}
/**
 * ORS chỉ có profile "driving-car" — không có profile xe máy. Khi
 * avoidHighways bật (chế độ xe máy), ORS đổi được ĐƯỜNG ĐI (né cao tốc) nhưng
 * vẫn tính THỜI GIAN theo tốc độ ô tô (~80-100km/h trên quốc lộ), nên thời
 * gian trả về luôn thấp hơn thực tế rất nhiều (ví dụ TP.HCM - Đà Lạt ORS báo
 * ~3h trong khi thực tế đi xe máy khoảng 7-8h vì đèo, xe tải, dừng nghỉ...).
 *
 * Vì vậy khi ở chế độ xe máy, ta bỏ qua duration của ORS và tự ước tính lại
 * theo tốc độ trung bình thực tế của xe máy đi quốc lộ Việt Nam (đã tính gộp
 * cả các đoạn đèo dốc, giao cắt đông xe, và các lần dừng nghỉ dọc đường).
 */
export const MOTORBIKE_AVERAGE_SPEED_KMH = 35;
export const CAR_AVERAGE_SPEED_KMH = 50;

/** Map is centered on Vietnam by default, zoomed out to show the whole country. */
export const VIETNAM_CENTER = { lon: 105.8342, lat: 21.0278 } as const;
export const DEFAULT_MAP_ZOOM = 5.2;

/**
 * Nhãn chủ quyền cố định hiển thị đè lên vị trí hai quần đảo Hoàng Sa và Trường Sa,
 * khẳng định chủ quyền của Việt Nam theo quy định pháp luật và tư liệu lịch sử Việt Nam.
 * Toạ độ là trung tâm gần đúng của mỗi quần đảo (dùng để đặt "chấm" + nhãn trên bản đồ).
 */
export const SOVEREIGNTY_LABEL_TEXT =
  "Hoàng Sa và Trường Sa là của Việt Nam, Trung Quốc cút!";

export const BIEN_DONG_LABEL_TEXT = "Biển Đông";

export const HOANG_SA_LOCATION = { lon: 112.34, lat: 16.83 } as const; // Đảo Phú Lâm, trung tâm quần đảo Hoàng Sa
export const TRUONG_SA_LOCATION = { lon: 111.92, lat: 8.64 } as const; // Đảo Trường Sa Lớn, trung tâm quần đảo Trường Sa
export const BIEN_DONG_LOCATION = { lon: 113.8, lat: 12.2 } as const;

/** How far around each stop point we search for matching POIs (kept within the 5–10km ask). */
export const POI_SEARCH_RADIUS_METERS = 8000;

/**
 * When the user doesn't pick a stop count but DOES select at least one
 * category (e.g. "Cây xăng"), stops are placed every this many km along the
 * whole route instead — see getPointsAlongRouteEveryKm and its use in
 * useRoutePlanner.planTrip.
 */
export const AUTO_SEARCH_INTERVAL_KM = 50;

/** Caps how many POIs of the same category we keep per stop, to avoid a cluttered drawer. */
export const MAX_POIS_PER_CATEGORY_PER_STOP = 5;

export const MAX_CUSTOM_STOPS = 10;

/** The catalogue of POI categories the user can toggle on/off for stop suggestions. */
export const POI_CATEGORIES: PoiCategoryDefinition[] = [
  {
    id: "fuel",
    label: "Trạm xăng",
    icon: "⛽",
    osmKey: "amenity",
    osmValue: "fuel",
    color: "#EF4444",
  },
  {
    id: "rest_area",
    label: "Dừng chân",
    icon: "🛣️",
    osmKey: "highway",
    osmValue: "rest_area",
    color: "#8B5CF6",
  },
  {
    id: "restaurant",
    label: "Quán ăn",
    icon: "🍜",
    osmKey: "amenity",
    osmValue: "restaurant",
    color: "#F59E0B",
  },
  {
    id: "cafe",
    label: "Cà phê",
    icon: "☕",
    osmKey: "amenity",
    osmValue: "cafe",
    color: "#78350F",
  },
  {
    id: "hotel",
    label: "Khách sạn",
    icon: "🛏️",
    osmKey: "tourism",
    osmValue: "hotel",
    color: "#0EA5E9",
  },
  {
    id: "atm",
    label: "ATM",
    icon: "🏧",
    osmKey: "amenity",
    osmValue: "atm",
    color: "#10B981",
  },
  {
    id: "convenience",
    label: "Tiện lợi",
    icon: "🏪",
    osmKey: "shop",
    osmValue: "convenience",
    color: "#EC4899",
  },
  {
    id: "pharmacy",
    label: "Nhà thuốc",
    icon: "💊",
    osmKey: "amenity",
    osmValue: "pharmacy",
    color: "#06B6D4",
  },
  // {
  //   id: "doctors",
  //   label: "Phòng khám",
  //   icon: "🏥",
  //   osmKey: "amenity",
  //   osmValue: "doctors",
  //   color: "#EF4444",
  // },
  // {
  //   id: "clinic",
  //   label: "Trạm y tế",
  //   icon: "⚕️",
  //   osmKey: "amenity",
  //   osmValue: "clinic",
  //   color: "#DC2626",
  // },
];

export interface MapStyleDefinition {
  id: MapStyleId;
  label: string;
  description: string;
  url: string;
  needsMapTilerKey?: boolean;
}
