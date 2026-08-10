'use client';

import { useEffect, useState } from 'react';
import { searchPlaces } from '@/lib/geocoding/nominatim';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { PlaceResult } from '@/lib/types';

interface PlaceAutocompleteInputProps {
  label: string;
  placeholder: string;
  value: PlaceResult | null;
  onSelect: (place: PlaceResult | null) => void;
}

/**
 * A text input that doubles as a search box: typing debounces into a free
 * Nominatim geocoding query, and results appear in a dropdown to pick from.
 * Used for both the "điểm xuất phát" and "điểm kết thúc" fields.
 */
export function PlaceAutocompleteInput({
  label,
  placeholder,
  value,
  onSelect,
}: PlaceAutocompleteInputProps) {
  const [query, setQuery] = useState(value?.label ?? '');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 400);

  // Keep the visible text in sync if the selected place changes from elsewhere (e.g. Reset).
  useEffect(() => {
    setQuery(value?.label ?? '');
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
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink/50">
        {label}
      </label>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
          if (value) onSelect(null);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      {isOpen && query.length >= 3 && (
        <div className="absolute bottom-full z-50 mb-2 max-h-64 w-full overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-xl">
          {isSearching && <p className="px-4 py-3 text-xs text-ink/40">Đang tìm kiếm…</p>}
          {!isSearching && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-ink/40">Không tìm thấy địa điểm phù hợp.</p>
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
