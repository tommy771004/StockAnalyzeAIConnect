/**
 * src/terminal/ui/PersonaSelector.tsx
 *
 * 投資大師 AI 人格選擇器
 * 從 /api/agent/personas 取得列表，讓使用者選擇 AI 以哪位大師的視角分析
 */

import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PersonaDef {
  id:         string;
  name:       string;
  nameZh:     string;
  emoji:      string;
  philosophy: string;
  philosophyEn?: string;
}

interface PersonaSelectorProps {
  value:    string;
  onChange: (personaId: string) => void;
  compact?: boolean;
}

export function PersonaSelector({ value, onChange, compact = false }: PersonaSelectorProps) {
  const { t, i18n } = useTranslation();
  const [personas, setPersonas]   = useState<PersonaDef[]>([]);
  const [open, setOpen]           = useState(false);
  const ref                       = useRef<HTMLDivElement>(null);
  const isZh = i18n.language.startsWith('zh');

  // Load personas list from backend once
  useEffect(() => {
    fetch('/api/agent/personas')
      .then(r => r.json())
      .then((list: PersonaDef[]) => setPersonas(list))
      .catch(() => { /* silently fail */ });
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = personas.find(p => p.id === value);
  const currentLabel = current ? (isZh ? current.nameZh : current.name) : t('research.persona.hermes', 'Hermes 通用');

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-2 rounded border border-(--color-term-border) bg-(--color-term-surface)',
          'text-[12px] text-(--color-term-text) hover:border-(--color-term-accent) transition-colors',
          compact ? 'px-2 py-1' : 'px-3 py-2',
        )}
        title={t('research.personaSelectorTitle', '選擇 AI 人格 / 投資大師視角')}
      >
        <span>{current?.emoji ?? '⚡'}</span>
        {!compact && (
          <span className="hidden sm:inline max-w-[140px] truncate">
            {currentLabel}
          </span>
        )}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && personas.length > 0 && (
        <div
          className={cn(
            'absolute right-0 z-50 mt-1 w-72 rounded border border-(--color-term-border)',
            'bg-(--color-term-panel) shadow-2xl overflow-y-auto',
          )}
          style={{ maxHeight: '380px' }}
        >
          {/* Section headers */}
          {PERSONA_GROUPS.map((group) => {
            const groupPersonas = personas.filter(p => group.ids.includes(p.id));
            if (groupPersonas.length === 0) return null;
            return (
              <div key={group.key}>
                <div className="px-3 pt-3 pb-1 text-[9px] tracking-[0.15em] text-(--color-term-muted) uppercase">
                  {t(group.key, group.fallback)}
                </div>
                {groupPersonas.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.id); setOpen(false); }}
                    className={cn(
                      'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
                      'hover:bg-(--color-term-accent)/10',
                      p.id === value && 'bg-(--color-term-accent)/15 border-l-2 border-(--color-term-accent)',
                    )}
                  >
                    <span className="text-[18px] leading-none mt-0.5">{p.emoji}</span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-(--color-term-text)">{isZh ? p.nameZh : p.name}</div>
                      <div className="text-[10px] text-(--color-term-muted) leading-snug truncate">{isZh ? p.philosophy : (p.philosophyEn ?? p.philosophy)}</div>
                    </div>
                    {p.id === value && (
                      <span className="ml-auto text-[10px] text-(--color-term-accent) shrink-0 mt-0.5">✓ {t('research.personaActive', '使用中')}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Group definitions (ordering for display)
const PERSONA_GROUPS: Array<{ key: string; fallback: string; ids: string[] }> = [
  { key: 'research.personaGroupGeneral', fallback: '通用 AI', ids: ['hermes'] },
  { key: 'research.personaGroupValue', fallback: '價值投資大師', ids: ['buffett', 'munger', 'graham', 'lynch'] },
  { key: 'research.personaGroupMacro', fallback: '宏觀/量化大師', ids: ['soros', 'dalio', 'simons', 'cathie_wood'] },
  { key: 'research.personaGroupSpecial', fallback: '特殊視角', ids: ['congress_tracker', 'geopolitics', 'risk_manager'] },
];
