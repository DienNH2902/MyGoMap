import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'outline' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-primary to-accent-gold text-ink shadow-glow hover:brightness-110 active:brightness-95',
  outline: 'border border-primary/40 text-cream hover:bg-primary/10',
  ghost: 'text-ink/70 hover:text-ink hover:bg-ink/5',
};

/** Shared button used across MyGoMap, so every call-to-action looks and feels consistent. */
export function Button({ variant = 'primary', className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
