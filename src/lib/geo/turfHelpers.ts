import * as turf from "@turf/turf";

export interface StopPoint {
  lon: number;
  lat: number;
  distanceFromStartKm: number;
}

/** Builds a GeoJSON LineString feature from an ordered array of [lon, lat] coordinates. */
function buildLineString(
  coordinates: [number, number][],
): GeoJSON.Feature<GeoJSON.LineString> {
  return turf.lineString(coordinates);
}

/** Total length of a route, in kilometers. */
export function calculateRouteLengthKm(
  coordinates: [number, number][],
): number {
  return turf.length(buildLineString(coordinates), { units: "kilometers" });
}

/**
 * Splits a route into `stopCount` evenly spaced points, excluding the very start
 * and very end of the trip (those are the user's own origin/destination).
 * This is the core of the "custom stop-suggestion algorithm" — everything here
 * runs entirely in the browser via Turf.js, with no backend involved.
 */
export function getEvenlySpacedStopPoints(
  coordinates: [number, number][],
  stopCount: number,
): StopPoint[] {
  if (stopCount <= 0 || coordinates.length < 2) return [];

  const line = buildLineString(coordinates);
  const totalKm = turf.length(line, { units: "kilometers" });
  const segmentKm = totalKm / (stopCount + 1);
  const stops: StopPoint[] = [];

  for (let i = 1; i <= stopCount; i += 1) {
    const distanceKm = segmentKm * i;
    const point = turf.along(line, distanceKm, { units: "kilometers" });
    const lon = point.geometry.coordinates[0];
    const lat = point.geometry.coordinates[1];

    // Defensive check: turf always returns a 2D point here, but TypeScript's
    // `noUncheckedIndexedAccess` can't prove that from the array type alone.
    if (lon === undefined || lat === undefined) continue;

    stops.push({ lon, lat, distanceFromStartKm: distanceKm });
  }

  return stops;
}

/**
 * Places points every `intervalKm` along the whole route (start → end), used
 * when the user picked NO stop count but DID select at least one category
 * (e.g. "Cây xăng") — there's no fixed number of stops to space evenly, so
 * instead we scan the entire route at a fixed interval and search near each
 * point, the same way a rider would just watch for gas stations as they go.
 * Unlike getEvenlySpacedStopPoints, this INCLUDES points near the very start
 * and end (skipped only if they'd fall closer than half an interval to
 * start/end, to avoid an almost-duplicate stop right next to the endpoints).
 */
export function getPointsAlongRouteEveryKm(
  coordinates: [number, number][],
  intervalKm: number,
): StopPoint[] {
  if (intervalKm <= 0 || coordinates.length < 2) return [];

  const line = buildLineString(coordinates);
  const totalKm = turf.length(line, { units: "kilometers" });
  if (totalKm <= 0) return [];

  const points: StopPoint[] = [];
  const halfInterval = intervalKm / 2;

  for (
    let distanceKm = intervalKm;
    distanceKm < totalKm - halfInterval;
    distanceKm += intervalKm
  ) {
    const point = turf.along(line, distanceKm, { units: "kilometers" });
    const lon = point.geometry.coordinates[0];
    const lat = point.geometry.coordinates[1];

    if (lon === undefined || lat === undefined) continue;

    points.push({ lon, lat, distanceFromStartKm: distanceKm });
  }

  return points;
}

/** Straight-line distance between two coordinates, in kilometers. */
export function distanceBetweenKm(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number },
): number {
  return turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]), {
    units: "kilometers",
  });
}

export function getDistanceFromRouteStartKm(
  coordinates: [number, number][],
  point: { lon: number; lat: number },
): number {
  if (coordinates.length < 2) return 0;

  const line = buildLineString(coordinates);
  const snappedPoint = turf.nearestPointOnLine(
    line,
    turf.point([point.lon, point.lat]),
    { units: "kilometers" },
  );

  const distanceFromStartKm = snappedPoint.properties.location;

  return typeof distanceFromStartKm === "number" ? distanceFromStartKm : 0;
}
