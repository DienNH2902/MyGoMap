"use client";

import { useEffect, useState } from "react";
import { reverseGeocode } from "@/lib/geocoding/nominatim";
import { findNearbyMapillaryImage } from "@/lib/images/mapillaryClient";
import { findNearbyCommonsImage } from "@/lib/images/wikimediaCommons";
import type { PoiResult } from "@/lib/types";

const ENRICHMENT_GAP_MS = 1100;

async function resolveImageForPoi(
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<string | null> {
  const mapillaryPhoto = await findNearbyMapillaryImage(lat, lon, signal);
  if (mapillaryPhoto) return mapillaryPhoto;
  return findNearbyCommonsImage(lat, lon, signal);
}

export interface EnrichedPoiInfo {
  address: string | undefined;
  isLookingUpAddress: boolean;
  imageUrl: string | undefined;
  isLookingUpImage: boolean;
}

/**
 * Lazily backfills `address` / `imageUrl` for whichever POIs are passed in
 * (reverse-geocoding + Mapillary/Wikimedia Commons lookups), one at a time
 * with a gap between requests to stay polite to the free APIs involved.
 *
 * Shared by StopDetailDrawer (enriches every POI in the currently open stop)
 * and the map's POI detail card (enriches whichever single POI was clicked,
 * even if its parent stop's sidebar isn't open) so both surfaces reuse the
 * same lookups instead of double-fetching.
 */
export function usePoiEnrichment(pois: PoiResult[]) {
  const [resolvedAddresses, setResolvedAddresses] = useState<
    Record<string, string | null>
  >({});
  const [resolvedImages, setResolvedImages] = useState<
    Record<string, string | null>
  >({});
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setResolvedAddresses({});
    setResolvedImages({});
    setBrokenImageIds(new Set());

    const poisNeedingEnrichment = pois.filter(
      (poi) => !poi.address || !poi.imageUrl,
    );
    if (poisNeedingEnrichment.length === 0) return;

    const controller = new AbortController();
    let cancelled = false;

    async function enrichSequentially() {
      for (const poi of poisNeedingEnrichment) {
        if (cancelled) return;

        const [address, image] = await Promise.all([
          poi.address
            ? Promise.resolve(null)
            : reverseGeocode(poi.lat, poi.lon, controller.signal),
          poi.imageUrl
            ? Promise.resolve(null)
            : resolveImageForPoi(poi.lat, poi.lon, controller.signal),
        ]);

        if (cancelled) return;

        if (!poi.address)
          setResolvedAddresses((prev) => ({ ...prev, [poi.id]: address }));
        if (!poi.imageUrl)
          setResolvedImages((prev) => ({ ...prev, [poi.id]: image }));

        await new Promise((resolve) => setTimeout(resolve, ENRICHMENT_GAP_MS));
      }
    }

    void enrichSequentially();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pois]);

  function markImageBroken(poiId: string) {
    setBrokenImageIds((prev) => new Set(prev).add(poiId));
  }

  function getEnriched(poi: PoiResult): EnrichedPoiInfo {
    const addressLookup = resolvedAddresses[poi.id];
    const address = poi.address ?? addressLookup ?? undefined;
    const isLookingUpAddress = !poi.address && addressLookup === undefined;

    const imageLookup = resolvedImages[poi.id];
    const rawImageUrl = poi.imageUrl ?? imageLookup ?? undefined;
    const imageUrl =
      rawImageUrl && !brokenImageIds.has(poi.id) ? rawImageUrl : undefined;
    const isLookingUpImage = !poi.imageUrl && imageLookup === undefined;

    return { address, isLookingUpAddress, imageUrl, isLookingUpImage };
  }

  return { getEnriched, markImageBroken };
}