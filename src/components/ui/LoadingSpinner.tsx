interface LoadingSpinnerProps {
  label?: string;
}

/** Minimal inline spinner with an optional label, used while data is being fetched. */
export function LoadingSpinner({ label }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink/60">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      {label && <span>{label}</span>}
    </div>
  );
}
