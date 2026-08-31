/**
 * Core domain types used throughout MyGoMap.
 * Kept in one place so every layer (routing, geocoding, POI search, UI) speaks
 * the same vocabulary without ever needing `any`.
 */

/** A named location the user picked, either by search or by geocoding a typed address. */
export interface PlaceResult {
  id: string;
  label: string;
  lon: number;
  lat: number;
  /** Kinh độ alias tương đương với lon để dùng thuận tiện khi mapping sang map/marker component */
  lng?: number;
  /** Địa chỉ chi tiết (nếu có từ geocoding/search) */
  address?: string;
}

/** Identifier for each point-of-interest category the user can filter stops by. */
export type PoiCategoryId =
  | "fuel"
  | "rest_area"
  | "restaurant"
  | "cafe"
  | "hotel"
  | "atm"
  | "convenience"
  | "pharmacy"
  | "clinic"
  | "doctors";

/** Static definition of a POI category: label, icon, and the OSM tag used to query Overpass. */
export interface PoiCategoryDefinition {
  id: PoiCategoryId;
  label: string;
  icon: string;
  osmKey: string;
  osmValue: string;
  /** Hex color used to draw this category's dots on the map (kept distinct per category). */
  color: string;
}

/** A single point of interest returned by the Overpass API near a route stop. */
export interface PoiResult {
  id: string;
  name: string;
  category: PoiCategoryId;
  lon: number;
  lat: number;
  address?: string;
  imageUrl?: string;
  distanceFromStopKm: number;
}

/** One planned stop along the route: its position, distance from the trip start, and nearby POIs. */
export interface RouteStop {
  id: string;
  order: number;
  lon: number;
  lat: number;
  distanceFromStartKm: number;
  pois: PoiResult[];
}

/** The computed driving route between the start and end point. */
export interface RouteGeometry {
  coordinates: [number, number][];
  distanceKm: number;
  durationMinutes: number;
  noTrafficDurationMinutes?: number;
  trafficDelayMinutes?: number;
  /**
   * Đoạn nối NGẮN [vị trí GPS thật, điểm gần nhất trên tuyến đã cache] —
   * chỉ xuất hiện khi đang dẫn đường và người dùng đã đi lệch ra khỏi
   * ngưỡng bám đường (xem MAX_SNAP_TO_ROUTE_METERS trong
   * useNavigationTracking.ts), ví dụ rẽ sang một đường phụ chạy song song
   * với tuyến chính. Đây KHÔNG phải một đoạn đường thật — chỉ là chỉ dẫn
   * trực quan "tuyến chính đang chờ ở đây, quay lại đi". MapView.tsx vẽ
   * đoạn này bằng một layer RIÊNG, có màu/kiểu nét khác hẳn tuyến chính để
   * không bị hiểu nhầm là một đoạn đường thật (nó có thể cắt xuyên qua nhà
   * cửa, vật thể... vì chỉ là đường chim bay). null/undefined khi người
   * dùng đang bám đúng tuyến, không cần hiển thị chỉ dẫn này.
   */
  offRouteConnector?: [[number, number], [number, number]] | null;
}

/** Aggregated result of a full trip-planning request. */
export interface TripPlan {
  route: RouteGeometry;
  stops: RouteStop[];
}

export interface RouteStop {
  id: string;
  order: number;
  lon: number;
  lat: number;
  distanceFromStartKm: number;
  label?: string;
  source?: "auto" | "custom" | "interval";
  pois: PoiResult[];
}
