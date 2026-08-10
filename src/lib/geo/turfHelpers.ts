import * as turf from '@turf/turf';

export interface StopPoint {
  lon: number;
  lat: number;
  distanceFromStartKm: number;
}

/** Builds a GeoJSON LineString feature from an ordered array of [lon, lat] coordinates. */
function buildLineString(coordinates: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return turf.lineString(coordinates);
}

/** Total length of a route, in kilometers. */
export function calculateRouteLengthKm(coordinates: [number, number][]): number {
  return turf.length(buildLineString(coordinates), { units: 'kilometers' });
}

/**
 * Splits a route into `stopCount` evenly spaced points, excluding the very start
 * and very end of the trip (those are the user's own origin/destination).
 * This is the core of the "custom stop-suggestion algorithm" — everything here
 * runs entirely in the browser via Turf.js, with no backend involved.
 */
export function getEvenlySpacedStopPoints(
  coordinates: [number, number][],
  stopCount: number
): StopPoint[] {
  if (stopCount <= 0 || coordinates.length < 2) return [];

  const line = buildLineString(coordinates);
  const totalKm = turf.length(line, { units: 'kilometers' });
  const segmentKm = totalKm / (stopCount + 1);
  const stops: StopPoint[] = [];

  for (let i = 1; i <= stopCount; i += 1) {
    const distanceKm = segmentKm * i;
    const point = turf.along(line, distanceKm, { units: 'kilometers' });
    const lon = point.geometry.coordinates[0];
    const lat = point.geometry.coordinates[1];

    // Defensive check: turf always returns a 2D point here, but TypeScript's
    // `noUncheckedIndexedAccess` can't prove that from the array type alone.
    if (lon === undefined || lat === undefined) continue;

    stops.push({ lon, lat, distanceFromStartKm: distanceKm });
  }

  return stops;
}

/** Straight-line distance between two coordinates, in kilometers. */
export function distanceBetweenKm(
  a: { lon: number; lat: number },
  b: { lon: number; lat: number }
): number {
  return turf.distance(turf.point([a.lon, a.lat]), turf.point([b.lon, b.lat]), {
    units: 'kilometers',
  });
}
