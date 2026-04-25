import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import * as api from '../../services/api';

interface Sector {
  id: string;
  name: string;
}

interface SectorSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function SectorSelector({ selectedIds, onChange, placeholder = "Search sectors..." }: SectorSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [allSectors, setAllSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSectors = async () => {
      try {
        const data = await api.getSectors();
        setAllSectors(data);
      } catch (err) {
        console.error('Failed to fetch sectors:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSectors();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSectors = allSectors.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleSector = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedSectors = allSectors.filter(s => selectedIds.includes(s.id));

  return (
    <div className="flex flex-col gap-2 w-full" ref={containerRef}>
      <div className="relative">
        <div 
          className={cn(
            "flex items-center gap-2 px-3 h-11 bg-(--color-term-bg) border rounded-sm cursor-pointer transition-colors",
            isOpen ? "border-(--color-term-accent)" : "border-(--color-term-border) hover:border-white/20"
          )}
          onClick={() => setIsOpen(!isOpen)}
        >
          <Search size={16} className="text-(--color-term-muted)" />
          <input
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-(--color-term-muted) pointer-events-none"
            placeholder={placeholder}
            value={searchTerm}
            readOnly
          />
          <ChevronDown size={16} className={cn("text-(--color-term-muted) transition-transform", isOpen && "rotate-180")} />
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-(--color-term-panel) border border-(--color-term-border) rounded-sm shadow-2xl max-h-64 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-(--color-term-border)">
              <div className="flex items-center gap-2 px-2 h-9 bg-(--color-term-bg) rounded-sm">
                <Search size={14} className="text-(--color-term-muted)" />
                <input
                  autoFocus
                  type="text"
                  className="flex-1 bg-transparent border-none outline-none text-sm"
                  placeholder="Filter industry..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              {loading ? (
                <div className="p-4 text-center text-xs text-(--color-term-muted)">Loading sectors...</div>
              ) : filteredSectors.length === 0 ? (
                <div className="p-4 text-center text-xs text-(--color-term-muted)">No sectors found</div>
              ) : (
                filteredSectors.map(s => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-white/5 transition-colors",
                      selectedIds.includes(s.id) && "text-(--color-term-accent) bg-(--color-term-accent)/5"
                    )}
                    onClick={() => toggleSector(s.id)}
                  >
                    <span>{s.name}</span>
                    {selectedIds.includes(s.id) && <Check size={14} />}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected Tags Display */}
      {selectedSectors.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-1 animate-in fade-in slide-in-from-top-1">
          {selectedSectors.map(s => (
            <div 
              key={s.id}
              className="flex items-center gap-1 px-2 py-1 bg-(--color-term-accent)/10 border border-(--color-term-accent)/30 rounded-sm text-[10px] font-bold text-(--color-term-accent) animate-in zoom-in-95"
            >
              <span>{s.name}</span>
              <button 
                type="button"
                onClick={() => toggleSector(s.id)}
                className="p-0.5 hover:bg-white/10 rounded-full transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
