import type { PoiCategoryDefinition } from "./types";

export type MapStyleId = "standard" | "topo" | "outdoor";

/**
 * Every external service below is free and requires no backend:
 * - OpenRouteService: free driving-route API (needs a free personal API key).
 * - Nominatim: free OSM geocoding (search-by-address), no key needed.
 * - Overpass API: free OSM data queries (points of interest), no key needed.
 * - CARTO basemap style: free vector tiles, no key needed, safe for light production use
 *   (unlike the raw tile.openstreetmap.org server, which explicitly disallows app usage).
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
      ? `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`
      : MAP_STYLE_URL,
    needsMapTilerKey: true,
  },
  outdoor: {
    id: "outdoor",
    label: "Outdoor",
    description: "Bản đồ ngoài trời, phù hợp xem núi/đèo/đường xa.",
    url: MAPTILER_KEY
      ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
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
export const CAR_AVERAGE_SPEED_KMH = 60;

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

export const HOANG_SA_LOCATION = { lon: 112.34, lat: 16.83 } as const; // Đảo Phú Lâm, trung tâm quần đảo Hoàng Sa
export const TRUONG_SA_LOCATION = { lon: 111.92, lat: 8.64 } as const; // Đảo Trường Sa Lớn, trung tâm quần đảo Trường Sa

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
    label: "Trạm dừng chân",
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
    label: "Cửa hàng tiện lợi",
    icon: "🏪",
    osmKey: "shop",
    osmValue: "convenience",
    color: "#EC4899",
  },
];

export interface MapStyleDefinition {
  id: MapStyleId;
  label: string;
  description: string;
  url: string;
  needsMapTilerKey?: boolean;
}