'use client';

import { clsx } from 'clsx';
import { POI_CATEGORIES } from '@/lib/constants';
import type { PoiCategoryId } from '@/lib/types';

interface CategoryChipsProps {
  selected: PoiCategoryId[];
  onToggle: (id: PoiCategoryId) => void;
}

/** Multi-select toggle chips for choosing which POI categories to look for along the route. */
export function CategoryChips({ selected, onToggle }: CategoryChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {POI_CATEGORIES.map((category) => {
        const isActive = selected.includes(category.id);
        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onToggle(category.id)}
            className={clsx(
              'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
              isActive
                ? 'border-primary bg-primary text-white shadow-sm'
                : 'border-ink/10 bg-white text-ink/60 hover:border-primary/40 hover:text-primary'
            )}
          >
            <span aria-hidden="true">{category.icon}</span>
            {category.label}
          </button>
        );
      })}
    </div>
  );
}
