import { autotradingConfigRepo } from '../repositories/autotradingConfigRepo.js';
import { publishAutotradingEvent } from './ablyRealtime.js';
import { TradingSessionRegistry } from './TradingSessionRegistry.js';
import { sessionEventHub } from './sessionEventHub.js';

export const tradingSessionRegistry = new TradingSessionRegistry({
  repo: autotradingConfigRepo,
  publish: (userId, event) => {
    sessionEventHub.publish(userId, event);
    publishAutotradingEvent(userId, event);
  },
});
