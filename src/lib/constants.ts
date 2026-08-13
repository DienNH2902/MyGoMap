import type { PoiCategoryDefinition } from "./types";

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

/** Map is centered on Vietnam by default, zoomed out to show the whole country. */
export const VIETNAM_CENTER = { lon: 105.8342, lat: 21.0278 } as const;
export const DEFAULT_MAP_ZOOM = 5.2;

/**
 * Nhãn chủ quyền cố định hiển thị đè lên vị trí hai quần đảo Hoàng Sa và Trường Sa,
 * khẳng định chủ quyền của Việt Nam theo quy định pháp luật và tư liệu lịch sử Việt Nam.
 * Toạ độ là trung tâm gần đúng của mỗi quần đảo (dùng để đặt "chấm" + nhãn trên bản đồ).
 */
export const SOVEREIGNTY_LABEL_TEXT = "Hoàng Sa và Trường Sa là của Việt Nam, Trung Quốc cút!";

export const HOANG_SA_LOCATION = { lon: 112.34, lat: 16.83 } as const; // Đảo Phú Lâm, trung tâm quần đảo Hoàng Sa
export const TRUONG_SA_LOCATION = { lon: 111.92, lat: 8.64 } as const; // Đảo Trường Sa Lớn, trung tâm quần đảo Trường Sa

/** How far around each stop point we search for matching POIs (kept within the 5–10km ask). */
export const POI_SEARCH_RADIUS_METERS = 8000;

/** Caps how many POIs of the same category we keep per stop, to avoid a cluttered drawer. */
export const MAX_POIS_PER_CATEGORY_PER_STOP = 3;

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
