import { describe, it, expect } from 'vitest';
import { buildButtonClasses } from '../Button';

describe('buildButtonClasses', () => {
  it('includes primary background for primary variant', () => {
    const cls = buildButtonClasses('primary', 'md', false, false);
    expect(cls).toContain('bg-cyan-600');
    expect(cls).toContain('text-white');
  });

  it('includes constructive background for constructive variant', () => {
    const cls = buildButtonClasses('constructive', 'md', false, false);
    expect(cls).toContain('bg-emerald-600');
  });

  it('includes ghost classes for ghost variant', () => {
    const cls = buildButtonClasses('ghost', 'md', false, false);
    expect(cls).toContain('bg-white/5');
    expect(cls).toContain('text-white/50');
  });

  it('includes danger classes for danger variant', () => {
    const cls = buildButtonClasses('danger', 'md', false, false);
    expect(cls).toContain('text-rose-400');
  });

  it('includes feature (violet) classes for feature variant', () => {
    const cls = buildButtonClasses('feature', 'md', false, false);
    expect(cls).toContain('bg-violet-600');
  });

  it('adds disabled classes when loading=true', () => {
    const cls = buildButtonClasses('primary', 'md', true, false);
    expect(cls).toContain('opacity-40');
    expect(cls).toContain('cursor-not-allowed');
  });

  it('adds disabled classes when disabled=true', () => {
    const cls = buildButtonClasses('primary', 'md', false, true);
    expect(cls).toContain('opacity-40');
  });

  it('applies sm size classes', () => {
    const cls = buildButtonClasses('primary', 'sm', false, false);
    expect(cls).toContain('text-[9px]');
    expect(cls).toContain('py-1');
    expect(cls).toContain('px-3');
  });

  it('applies lg size classes', () => {
    const cls = buildButtonClasses('primary', 'lg', false, false);
    expect(cls).toContain('text-[11px]');
    expect(cls).toContain('py-2');
    expect(cls).toContain('px-5');
  });

  it('merges custom className', () => {
    const cls = buildButtonClasses('primary', 'md', false, false, 'w-full');
    expect(cls).toContain('w-full');
  });

  it('includes focus-ring class', () => {
    const cls = buildButtonClasses('primary', 'md', false, false);
    expect(cls).toContain('focus-ring');
  });
});
