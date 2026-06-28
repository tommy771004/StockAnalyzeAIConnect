import { describe, expect, it, vi } from 'vitest';

import { getAutotradingRealtimeMeta } from '../ablyRealtime.js';
import { SessionEventHub } from '../sessionEventHub.js';

describe('SessionEventHub', () => {
  it('publishes only to listeners owned by the target user', () => {
    const hub = new SessionEventHub();
    const userA = vi.fn();
    const userB = vi.fn();
    hub.subscribe('user-a', userA);
    hub.subscribe('user-b', userB);

    hub.publish('user-a', { type: 'agent_log', data: { symbol: 'AAPL' } });

    expect(userA).toHaveBeenCalledOnce();
    expect(userB).not.toHaveBeenCalled();
  });

  it('assigns distinct managed realtime channels per user', () => {
    const channelA = getAutotradingRealtimeMeta('user-a').ably.channel;
    const channelB = getAutotradingRealtimeMeta('user-b').ably.channel;
    expect(channelA).not.toBe(channelB);
    expect(channelA).toContain('user-a');
    expect(channelB).toContain('user-b');
  });
});
