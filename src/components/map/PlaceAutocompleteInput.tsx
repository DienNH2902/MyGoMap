"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlaces, searchWithNominatim } from "@/lib/geocoding/nominatim";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { PlaceResult } from "@/lib/types";

interface PlaceAutocompleteInputProps {
  label?: string;
  placeholder: string;
  value: PlaceResult | null;
  onSelect: (place: PlaceResult | null) => void;
  onUseCurrentLocation?: () => void;
  isLocating?: boolean;
  dropdownPlacement?: "top" | "bottom";
  userLocation?: {
    lat: number;
    lon: number;
  } | null;
  hideFocusRing?: boolean;
}

export function PlaceAutocompleteInput({
  label,
  placeholder,
  value,
  onSelect,
  onUseCurrentLocation,
  isLocating = false,
  dropdownPlacement = "top",
  userLocation,
  hideFocusRing = false,
}: PlaceAutocompleteInputProps) {
  const [query, setQuery] = useState(value?.label ?? "");

  const [results, setResults] = useState<PlaceResult[]>([]);

  const [isOpen, setIsOpen] = useState(false);

  const [isSearching, setIsSearching] = useState(false);

  /**
   * Debounce autocomplete = 400ms.
   *
   * Chỉ autocomplete bằng Nominatim.
   * Không đụng TomTom quota.
   */
  const debouncedQuery = useDebouncedValue(query, 400);

  /**
   * Controller của autocomplete request hiện tại.
   *
   * Khi user tiếp tục gõ:
   *
   * request cũ -> abort
   * request mới -> chạy
   */
  const autocompleteControllerRef = useRef<AbortController | null>(null);

  /**
   * Controller của Search button.
   */
  const searchControllerRef = useRef<AbortController | null>(null);

  /**
   * Request sequence để chống response cũ ghi đè
   * response mới.
   */
  const autocompleteRequestIdRef = useRef(0);

  const searchRequestIdRef = useRef(0);

  /**
   * Đánh dấu user vừa chọn một suggestion.
   *
   * Khi true:
   * - Không chạy lại autocomplete
   * - Không mở dropdown lại
   *
   * Reset về false khi user thực sự gõ nội dung mới.
   */
  const justSelectedPlaceRef = useRef(false);

  /**
   * Đồng bộ input khi value bên ngoài thay đổi.
   */
  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value]);

  /**
   * ============================================================
   * AUTOCOMPLETE - NOMINATIM ONLY
   * ============================================================
   *
   * Khi:
   *
   * user nhập:
   *     "đà"
   *
   * đợi 400ms
   *     ↓
   * Nominatim
   *
   * Không gọi TomTom.
   */

  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    /**
     * ============================================================
     * USER VỪA CHỌN SUGGESTION
     * ============================================================
     *
     * Đây là trường hợp quan trọng nhất.
     *
     * setQuery(place.label) sẽ làm effect chạy lại.
     * Nhưng đó không phải là user đang gõ query mới.
     *
     * Vì vậy phải bỏ qua effect này hoàn toàn.
     */
    if (justSelectedPlaceRef.current) {
      autocompleteControllerRef.current?.abort();

      setIsSearching(false);
      setResults([]);
      setIsOpen(false);

      return;
    }

    /**
     * Query quá ngắn hoặc đang lấy GPS.
     */
    if (trimmed.length < 2 || isLocating) {
      autocompleteControllerRef.current?.abort();

      setIsSearching(false);

      if (trimmed.length < 2) {
        setResults([]);
        setIsOpen(false);
      }

      return;
    }

    /**
     * Không autocomplete lại nếu query hiện tại
     * chính là label của value đã chọn.
     */
    if (value && trimmed === value.label.trim()) {
      autocompleteControllerRef.current?.abort();

      setIsSearching(false);
      setResults([]);
      setIsOpen(false);

      return;
    }

    /**
     * Hủy request Nominatim trước đó.
     */
    autocompleteControllerRef.current?.abort();

    const controller = new AbortController();

    autocompleteControllerRef.current = controller;

    const requestId = ++autocompleteRequestIdRef.current;

    setIsSearching(true);
    setIsOpen(true);

    /**
     * Không xóa results ngay.
     *
     * Như vậy khi user gõ:
     *
     * "h"
     * "ha"
     * "hà"
     *
     * dropdown không bị nhấp nháy trắng.
     */

    void searchWithNominatim(trimmed, controller.signal, userLocation)
      .then((places) => {
        /**
         * Chỉ nhận response mới nhất.
         */
        if (requestId !== autocompleteRequestIdRef.current) {
          return;
        }

        if (controller.signal.aborted) {
          return;
        }

        /**
         * Trong lúc request chạy, user có thể đã chọn
         * một suggestion khác.
         *
         * Không cho response cũ mở dropdown lại.
         */
        if (justSelectedPlaceRef.current) {
          return;
        }

        setResults(places);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error("Lỗi autocomplete Nominatim:", err);

        if (
          requestId === autocompleteRequestIdRef.current &&
          !justSelectedPlaceRef.current
        ) {
          setResults([]);
        }
      })
      .finally(() => {
        if (requestId === autocompleteRequestIdRef.current) {
          setIsSearching(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, userLocation, isLocating, value]);

  /**
   * ============================================================
   * SEARCH BUTTON - TOMTOM
   * ============================================================
   *
   * Chỉ khi:
   *
   * - bấm Search
   * - Enter
   *
   * mới gọi searchPlaces()
   *
   * searchPlaces():
   *
   * TomTom
   *   ↓
   * 429 / lỗi
   *   ↓
   * Nominatim fallback
   */

  async function handleSearch() {
    const trimmed = query.trim();

    if (trimmed.length < 2 || isSearching || isLocating) {
      return;
    }

    /**
     * Hủy autocomplete Nominatim đang chạy.
     */
    autocompleteControllerRef.current?.abort();

    /**
     * Hủy Search trước đó nếu còn.
     */
    searchControllerRef.current?.abort();

    const controller = new AbortController();

    searchControllerRef.current = controller;

    const requestId = ++searchRequestIdRef.current;

    setIsSearching(true);
    setIsOpen(true);

    /**
     * Search chính thức phải hiện kết quả mới.
     */
    setResults([]);

    try {
      /**
       * QUAN TRỌNG:
       *
       * Đây mới là nơi gọi TomTom.
       */
      const places = await searchPlaces(
        trimmed,
        controller.signal,
        userLocation,
      );

      if (
        controller.signal.aborted ||
        requestId !== searchRequestIdRef.current
      ) {
        return;
      }

      setResults(places);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      console.error("Lỗi tìm kiếm địa điểm:", err);

      if (requestId === searchRequestIdRef.current) {
        setResults([]);
      }
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   */

  useEffect(() => {
    return () => {
      autocompleteControllerRef.current?.abort();
      searchControllerRef.current?.abort();
    };
  }, []);

  const hasHeaderContent = Boolean(label) || Boolean(onUseCurrentLocation);

  const canSearch = query.trim().length >= 2 && !isLocating && !isSearching;

  return (
    <div className="relative w-full min-w-0 flex-1 sm:min-w-[200px]">
      {/* ======================================================
          HEADER
      ====================================================== */}

      {hasHeaderContent && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {Boolean(label) && (
            <label className="block truncate text-[10px] font-bold uppercase tracking-wide text-cream/50">
              {label}
            </label>
          )}

          {onUseCurrentLocation && (
            <button
              type="button"
              onClick={onUseCurrentLocation}
              disabled={isLocating}
              className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-primary transition hover:text-primary/80 hover:underline active:scale-95 disabled:opacity-50"
            >
              {isLocating ? (
                <>
                  <span className="h-2 w-2 animate-ping rounded-full bg-primary" />

                  <span className="truncate">Đang lấy định vị GPS…</span>
                </>
              ) : (
                "Vị trí hiện tại"
              )}
            </button>
          )}
        </div>
      )}

      {/* ======================================================
          INPUT
      ====================================================== */}

      <div className="relative flex items-center">
        {hideFocusRing && (
          <div className="pointer-events-none absolute left-3 flex items-center justify-center">
            <svg
              className="h-[26px] w-[26px] text-green-300"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>
        )}

        <input
          type="text"
          value={query}
          placeholder={isLocating ? "Đang xác định tọa độ GPS..." : placeholder}
          disabled={isLocating}
          onChange={(event) => {
            const nextQuery = event.target.value;

            /**
             * User thực sự bắt đầu chỉnh sửa input.
             *
             * Cho phép autocomplete hoạt động trở lại.
             */
            justSelectedPlaceRef.current = false;

            setQuery(nextQuery);

            /**
             * Người dùng bắt đầu sửa lại input
             * sau khi đã chọn địa điểm.
             */
            if (value) {
              onSelect(null);
            }

            /**
             * Mở lại autocomplete.
             *
             * API thật sự chỉ chạy sau debounce.
             */
            if (nextQuery.trim().length >= 2) {
              setIsOpen(true);
            } else {
              autocompleteControllerRef.current?.abort();

              setIsOpen(false);
              setResults([]);
            }
          }}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();

              if (canSearch) {
                void handleSearch();
              }
            }

            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          className={`w-full rounded-xl border border-ink/10 bg-black/30 py-2.5 pr-20 text-base text-cream placeholder:text-cream/30 transition focus:outline-none disabled:bg-black/10 disabled:text-cream/40 sm:text-sm ${
            hideFocusRing
              ? "pl-10 focus:border-white/20 placeholder:text-gray-500"
              : "px-4 focus:border-primary focus:ring-2 focus:ring-primary/30"
          }`}
        />

        {/* ====================================================
            CLEAR BUTTON
        ==================================================== */}

        {query.length > 0 && !isLocating && !isSearching && (
          <button
            type="button"
            onClick={() => {
              autocompleteControllerRef.current?.abort();

              setQuery("");
              setResults([]);
              setIsOpen(false);

              onSelect(null);
            }}
            className="absolute right-11 flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs text-cream/60 transition hover:bg-white/20 hover:text-cream active:scale-95"
            aria-label="Xóa nội dung nhập"
            title="Xóa"
          >
            ✕
          </button>
        )}

        {/* ====================================================
            SEARCH BUTTON
        ==================================================== */}

        <button
          type="button"
          onClick={() => {
            if (canSearch) {
              void handleSearch();
            }
          }}
          disabled={!canSearch}
          aria-label="Tìm kiếm"
          title={isSearching ? "Đang tìm kiếm..." : "Tìm kiếm"}
          className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-lg text-cream/70 transition hover:bg-white/10 hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isSearching ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cream/30 border-t-cream" />
          ) : (
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />

              <path d="m20 20-3.5-3.5" />
            </svg>
          )}
        </button>
      </div>

      {/* ======================================================
          DROPDOWN
      ====================================================== */}

      {isOpen && (
        <div
          className={`absolute left-0 right-0 z-50 w-full overflow-hidden rounded-xl border border-ink/10 bg-ink/95 shadow-2xl backdrop-blur-md ${
            dropdownPlacement === "bottom"
              ? "top-full mt-2"
              : "bottom-full mb-2"
          }`}
        >
          <div className="max-h-56 overflow-y-auto sm:max-h-64">
            {/* ==================================================
                LOADING
            ================================================== */}

            {isSearching && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-cream/50">
                <span className="h-3 w-3 animate-spin rounded-full border border-cream/20 border-t-cream/70" />

                <span>Đang tìm kiếm…</span>
              </div>
            )}

            {/* ==================================================
                NO RESULT
            ================================================== */}

            {!isSearching &&
              results.length === 0 &&
              query.trim().length >= 2 && (
                <p className="px-4 py-3 text-xs text-cream/50">
                  Không tìm thấy địa điểm phù hợp.
                </p>
              )}

            {/* ==================================================
                RESULTS
            ================================================== */}

            {!isSearching &&
              results.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => {
                    /**
                     * Đánh dấu trước khi thay đổi state/props.
                     *
                     * Điều này ngăn useEffect autocomplete chạy lại
                     * sau khi setQuery() / onSelect().
                     */
                    justSelectedPlaceRef.current = true;

                    /**
                     * Hủy request autocomplete ngay lập tức.
                     */
                    autocompleteControllerRef.current?.abort();

                    /**
                     * Tăng request id để mọi response cũ
                     * trở thành stale.
                     */
                    autocompleteRequestIdRef.current += 1;

                    /**
                     * Tắt UI ngay.
                     */
                    setIsSearching(false);
                    setResults([]);
                    setIsOpen(false);

                    /**
                     * Cập nhật giá trị được chọn.
                     */
                    setQuery(place.label);
                    onSelect(place);
                  }}
                  title={place.label}
                  className="group relative block w-full border-b border-white/5 px-4 py-3 text-left text-sm text-cream/80 transition touch-manipulation hover:bg-white/10 hover:text-white active:bg-white/15 last:border-none sm:py-2.5"
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
