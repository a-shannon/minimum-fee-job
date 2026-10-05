import { createClient } from '@vercel/kv';
import * as crypto from 'node:crypto';

import { TokenMap } from '@rosen-bridge/tokens';

import { kvRestApiUrl, kvRestApiToken } from './configs';
import { SupportedTokenConfig } from './types';

const kv =
  kvRestApiUrl && kvRestApiToken
    ? createClient({
        url: kvRestApiUrl,
        token: kvRestApiToken,
      })
    : null;

/**
 * save tokens config into store
 */
const saveTokensConfig = async (config: SupportedTokenConfig[]) => {
  return void (await kv?.set('tokens-config', JSON.stringify(config)));
};

/**
 * save token map config into store
 */
const saveTokenMap = async (tokenMap: TokenMap) => {
  const tokenMapJSON = JSON.stringify(tokenMap.getConfig());
  const tokenMapHash = crypto.hash('sha256', tokenMapJSON);
  return void (await kv?.set('token-map', {
    hash: tokenMapHash,
    tokenMap: tokenMap.getConfig(),
  }));
};

/**
 * save price data into store
 */
const savePrices = async (prices: Map<string, number>) => {
  return void (await kv?.hset('prices', Object.fromEntries(prices)));
};

/**
 * save tx chunks data into store
 */
const saveTx = async (tx: string) => {
  return void (await kv?.set('tx', tx));
};

/**
 * flush store, removing price and tx chunks data
 */
const flushStore = async () => {
  return void (await kv?.flushdb());
};

/**
 * save tokens config into store
 */
const saveRsnTokenId = async (rsnTokenId: string) => {
  return void (await kv?.set('rsn-token-id', rsnTokenId));
};

/** One atomic record; a missing configured store must not become a no-op. */
const saveAvalanchePublication = (
  key: string,
  payload: string,
): Promise<unknown> => {
  if (!kv) throw new Error('Avalanche publication requires configured KV');
  return kv.set(key, payload);
};

export {
  flushStore,
  saveTokensConfig,
  saveTokenMap,
  savePrices,
  saveTx,
  saveRsnTokenId,
  saveAvalanchePublication,
};
