import { DataProviderRegistry } from './registry.js';
import {
  createCongressProvider,
  createCnyesProvider,
  createFredProvider,
  createSecProvider,
  createSmartMoneyProvider,
  createTradingViewProvider,
  createTwseProvider,
  createWantGooChipProvider,
  createWantGooProvider,
  createYahooProvider,
  type CongressClient,
  type CnyesClient,
  type FredClient,
  type SecClient,
  type SmartMoneyClient,
  type TradingViewClient,
  type TwseClient,
  type WantGooChipClient,
  type WantGooClient,
  type YahooClient,
} from './providers.js';
import type { DataProvider } from './types.js';

export interface DefaultDataProviderDependencies {
  yahoo: YahooClient;
  twse: TwseClient;
  tradingView: TradingViewClient;
  sec: SecClient;
  smartMoney: SmartMoneyClient;
  congress: CongressClient;
  cnyes: CnyesClient;
  wantGooNews: WantGooClient;
  wantGooChip: WantGooChipClient;
  fred: FredClient;
}

export function createDefaultDataProviders(
  dependencies: DefaultDataProviderDependencies,
): DataProvider[] {
  return [
    createTwseProvider(dependencies.twse),
    createYahooProvider(dependencies.yahoo),
    createTradingViewProvider(dependencies.tradingView),
    createSecProvider(dependencies.sec),
    createSmartMoneyProvider(dependencies.smartMoney),
    createCongressProvider(dependencies.congress),
    createCnyesProvider(dependencies.cnyes),
    createWantGooProvider(dependencies.wantGooNews),
    createWantGooChipProvider(dependencies.wantGooChip),
    createFredProvider(dependencies.fred),
  ];
}

let configuredRegistry: DataProviderRegistry | null = null;

export function configureDataRegistry(
  providers: DataProvider[],
): DataProviderRegistry {
  if (!configuredRegistry) {
    configuredRegistry = new DataProviderRegistry(providers);
  }
  return configuredRegistry;
}

export function getDataRegistry(): DataProviderRegistry {
  if (!configuredRegistry) {
    throw new Error('Data registry is not configured');
  }
  return configuredRegistry;
}
