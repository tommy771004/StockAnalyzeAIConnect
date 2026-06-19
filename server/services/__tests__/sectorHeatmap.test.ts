import { describe, it, expect } from 'vitest';
import { mapMiIndexToSectors } from '../SectorService.js';

describe('mapMiIndexToSectors', () => {
  const rows = [
    { 指數: '半導體類指數', 漲跌: '+', 漲跌百分比: '1.24' },
    { 指數: '食品類指數', 漲跌: '-', 漲跌百分比: '-1.16' },
    { 指數: '金融保險類指數', 漲跌: '+', 漲跌百分比: '1.36' },
    { 指數: '半導體類報酬指數', 漲跌: '+', 漲跌百分比: '1.24' }, // must be excluded
    { 指數: '發行量加權股價指數', 漲跌: '+', 漲跌百分比: '1.28' }, // not a curated sector
  ];

  it('maps curated sectors with signed percent and short labels', () => {
    const cells = mapMiIndexToSectors(rows);
    const semi = cells.find((c) => c.id === '半導體類指數');
    const food = cells.find((c) => c.id === '食品類指數');
    expect(semi).toEqual({ id: '半導體類指數', name: '半導體', changePct: 1.24 });
    expect(food?.changePct).toBe(-1.16);
  });

  it('excludes 報酬/leverage variants and non-curated indices', () => {
    const cells = mapMiIndexToSectors(rows);
    expect(cells.some((c) => c.id.includes('報酬'))).toBe(false);
    expect(cells.some((c) => c.id === '發行量加權股價指數')).toBe(false);
  });
});
