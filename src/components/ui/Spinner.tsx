import React from 'react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block rounded-full border-2 border-white/20 border-t-cyan-500 animate-spin',
        size === 'sm' ? 'h-3 w-3' : 'h-5 w-5',
        className,
      )}
    />
  );
}
