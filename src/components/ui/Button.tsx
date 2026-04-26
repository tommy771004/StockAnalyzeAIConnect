import React from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'constructive' | 'ghost' | 'danger' | 'feature';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:      'bg-cyan-600 text-white hover:bg-cyan-500',
  constructive: 'bg-emerald-600 text-white hover:bg-emerald-500',
  ghost:        'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70',
  danger:       'bg-rose-600/20 text-rose-400 hover:bg-rose-600/30',
  feature:      'bg-violet-600 text-white hover:bg-violet-500',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'py-1 px-3 text-[9px]',
  md: 'py-1.5 px-4 text-[10px]',
  lg: 'py-2 px-5 text-[11px]',
};

export function buildButtonClasses(
  variant: ButtonVariant,
  size: ButtonSize,
  loading: boolean,
  disabled: boolean,
  className?: string,
): string {
  return cn(
    'inline-flex items-center justify-center gap-1.5 rounded font-bold uppercase tracking-wider',
    'motion-safe:transition-[background-color,color,opacity]',
    'focus-ring',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    (loading || disabled) && 'opacity-40 cursor-not-allowed pointer-events-none',
    className,
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  children,
  className,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={loading || !!disabled}
      aria-busy={loading || undefined}
      className={buildButtonClasses(variant, size, loading, !!disabled, className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : leftIcon}
      {children}
    </button>
  );
}
