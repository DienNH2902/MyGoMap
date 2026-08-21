"use client";

import { useEffect, useState } from "react";
import { searchPlaces } from "@/lib/geocoding/nominatim";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { PlaceResult } from "@/lib/types";

interface PlaceAutocompleteInputProps {
  label: string;
  placeholder: string;
  value: PlaceResult | null;
  onSelect: (place: PlaceResult | null) => void;
  onUseCurrentLocation?: () => void;
  isLocating?: boolean;
  dropdownPlacement?: "top" | "bottom";
}

export function PlaceAutocompleteInput({
  label,
  placeholder,
  value,
  onSelect,
  onUseCurrentLocation,
  isLocating = false,
  dropdownPlacement = "top",
}: PlaceAutocompleteInputProps) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 400);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();

    async function runSearch() {
      setIsSearching(true);
      const places = await searchPlaces(debouncedQuery, controller.signal);
      setResults(places);
      setIsSearching(false);
    }

    void runSearch();
    return () => controller.abort();
  }, [debouncedQuery, isOpen]);

  return (
    <div className="relative min-w-[200px] flex-1">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="block text-[10px] font-bold uppercase tracking-wide text-cream/50">
          {label}
        </label>
        {onUseCurrentLocation && (
          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={isLocating}
            className="flex items-center gap-1 text-[11px] font-semibold text-primary transition hover:text-primary/80 hover:underline disabled:opacity-50"
          >
            {isLocating ? (
              <>
                <span className="h-2 w-2 animate-ping rounded-full bg-primary" />
                Đang lấy định vị GPS…
              </>
            ) : (
              "Vị trí hiện tại"
            )}
          </button>
        )}
      </div>

      <input
        type="text"
        value={query}
        placeholder={isLocating ? "Đang xác định tọa độ GPS..." : placeholder}
        disabled={isLocating}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          if (value) onSelect(null);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className="w-full rounded-xl border border-ink/10 bg-black/30 px-4 py-2.5 text-sm text-cream placeholder:text-cream/30 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-black/10 disabled:text-cream/40"
      />

      {isOpen && query.length >= 2 && (
        <div
          className={`absolute z-50 w-full overflow-hidden rounded-xl border border-ink/10 bg-ink/95 shadow-2xl backdrop-blur-md ${
            dropdownPlacement === "bottom"
              ? "top-full mt-2"
              : "bottom-full mb-2"
          }`}
        >
          <div className="max-h-64 overflow-y-auto">
            {isSearching && (
              <p className="px-4 py-3 text-xs text-cream/50">Đang tìm kiếm…</p>
            )}
            {!isSearching && results.length === 0 && (
              <p className="px-4 py-3 text-xs text-cream/50">
                Không tìm thấy địa điểm phù hợp.
              </p>
            )}
            {results.map((place) => (
              <button
                key={place.id}
                type="button"
                onClick={() => {
                  onSelect(place);
                  setQuery(place.label);
                  setIsOpen(false);
                }}
                title={place.label}
                className="group relative block w-full border-b border-white/5 px-4 py-2.5 text-left text-sm text-cream/80 transition hover:bg-white/10 hover:text-white last:border-none"
              >
                <span className="line-clamp-2 group-hover:line-clamp-none group-hover:whitespace-normal">
                  {place.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
