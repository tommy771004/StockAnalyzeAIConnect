import { describe, it, expect } from 'vitest';
import { parseBest5Payload } from '../TWSeService.js';

describe('parseBest5Payload', () => {
  it('zips 5-level ask/bid prices with sizes, best level first', () => {
    const item = {
      c: '2330', n: '台積電', z: '1090.0000', y: '1085.0000', tlong: '1700000000000',
      a: '1090.0000_1095.0000_1100.0000_1105.0000_1110.0000_',
      b: '1085.0000_1080.0000_1075.0000_1070.0000_1065.0000_',
      f: '100_200_300_400_500_',
      g: '600_700_800_900_1000_',
    };
    const q = parseBest5Payload(item, 'TWSE');
    expect(q.symbol).toBe('2330');
    expect(q.price).toBe(1090);
    expect(q.asks).toHaveLength(5);
    expect(q.bids).toHaveLength(5);
    expect(q.asks[0]).toEqual({ price: 1090, size: 100 });
    expect(q.bids[0]).toEqual({ price: 1085, size: 600 });
    expect(q.source).toBe('TWSE');
  });

  it('returns empty ladders when session closed (dash placeholders)', () => {
    const item = { c: '2330', n: '台積電', z: '-', y: '1085.0000', a: '-_-_-_-_-_', b: '', f: '', g: '' };
    const q = parseBest5Payload(item, 'TWSE');
    expect(q.asks).toEqual([]);
    expect(q.bids).toEqual([]);
    expect(q.price).toBe(1085); // falls back to prevClose
  });
});
