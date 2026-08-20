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
