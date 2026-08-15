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
  isLocating?: boolean; // State hiển thị đang lấy GPS
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
        <label className="block text-xs font-medium uppercase tracking-wide text-ink/50">
          {label}
        </label>
        {onUseCurrentLocation && (
          <button
            type="button"
            onClick={onUseCurrentLocation}
            disabled={isLocating}
            className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
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
        className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50"
      />

      {isOpen && query.length >= 2 && (
        <div
          className={`absolute z-50 max-h-64 w-full overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-xl ${
            dropdownPlacement === "bottom"
              ? "top-full mt-2"
              : "bottom-full mb-2"
          }`}
        >
          {isSearching && (
            <p className="px-4 py-3 text-xs text-ink/40">Đang tìm kiếm…</p>
          )}
          {!isSearching && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink/40">
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
              className="block w-full truncate px-4 py-2.5 text-left text-sm text-ink/80 transition hover:bg-primary/5 hover:text-primary"
            >
              {place.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
