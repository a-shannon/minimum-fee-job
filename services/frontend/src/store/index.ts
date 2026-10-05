'use server';

import { createClient } from '@vercel/kv';
import process from 'node:process';

import { RosenTokens } from '@rosen-bridge/tokens';

import {
  BackendConfigParseError,
  EmptyBackendConfigError,
  EmptyTokensError,
  EmptyTxError,
  RedisConnectionError,
  RedisDataFetchingError,
} from '@/error';
import { wrap } from '@/safeServerAction';
import { PartialSupportedTokenConfig } from '@/types';

import {
  avalancheUiRequested,
  requireReviewedAvalancheUi,
} from '../avalanche/existingUi';
import { loadAvalanchePublication } from './avalanchePublication';

/**
 * connect to the redis client
 */
const connectRedisClient = async () => {
  try {
    const client = createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    return client;
  } catch (error) {
    throw new RedisConnectionError(error);
  }
};

/**
 * get backend tokens config from the store
 */
export const getTokensConfig = async (): Promise<
  PartialSupportedTokenConfig[]
> => {
  const client = await connectRedisClient();

  try {
    const config =
      await client.get<PartialSupportedTokenConfig[]>('tokens-config');
    if (config) {
      try {
        return config;
      } catch {
        throw new BackendConfigParseError();
      }
    } else {
      throw new EmptyBackendConfigError();
    }
  } catch (error) {
    throw new RedisDataFetchingError(error);
  }
};

export const getTokensConfigSafe = wrap(getTokensConfig);

/**
 * get price data from the store
 */
export const getPrices = async (): Promise<Record<string, string>> => {
  const client = await connectRedisClient();

  try {
    const prices = await client.hgetall<Record<string, string>>('prices');
    return prices ?? {};
  } catch (error) {
    throw new RedisDataFetchingError(error);
  }
};

export const getPricesSafe = wrap(getPrices);

/**
 * get tx data from the store
 */
export const getTx = async (
  expectedPublicationId?: string,
): Promise<string> => {
  if (avalancheUiRequested()) {
    const snapshot = requireReviewedAvalancheUi(
      await loadAvalanchePublication(),
      expectedPublicationId,
    );
    return JSON.stringify(snapshot.publication.transaction);
  }
  const client = await connectRedisClient();

  try {
    const tx = await client.get<Record<string, string>>('tx');

    if (!tx) {
      throw new EmptyTxError();
    }
    return JSON.stringify(tx);
  } catch (error) {
    throw new RedisDataFetchingError(error);
  }
};

export const getTxSafe = wrap(getTx);

/**
 * get tx data from the store
 */
export const getRsnTokenId = async (): Promise<string> => {
  const client = await connectRedisClient();

  try {
    const rsnTokenId = await client.get<string>('rsn-token-id');

    if (!rsnTokenId) {
      throw new EmptyTxError();
    }
    return rsnTokenId;
  } catch (error) {
    throw new RedisDataFetchingError(error);
  }
};

export const getRsnTokenIdSafe = wrap(getRsnTokenId);

/**
 * get token map data from the store
 */
export const getRosenTokens = async (): Promise<RosenTokens> => {
  const client = await connectRedisClient();

  try {
    const tokens = await client.get<{ tokenMap: RosenTokens }>('token-map');

    if (!tokens) {
      throw new EmptyTokensError();
    }

    return tokens.tokenMap;
  } catch (error) {
    throw new RedisDataFetchingError(error);
  }
};

export const getRosenTokensSafe = wrap(getRosenTokens);
