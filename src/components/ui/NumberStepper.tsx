'use client';

interface NumberStepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

/** A labeled +/- control, used here to let the user pick how many trip stops they want. */
export function NumberStepper({ label, value, min = 0, max = 10, onChange }: NumberStepperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink/50">{label}</span>
      <div className="flex items-center gap-3 rounded-full border border-ink/10 bg-white px-2 py-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-lg font-bold text-primary transition hover:bg-primary/10 disabled:opacity-30"
          aria-label="Giảm số điểm dừng"
        >
          −
        </button>
        <span className="w-6 text-center font-mono text-base font-semibold text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-muted text-lg font-bold text-primary transition hover:bg-primary/10 disabled:opacity-30"
          aria-label="Tăng số điểm dừng"
        >
          +
        </button>
      </div>
    </div>
  );
}
