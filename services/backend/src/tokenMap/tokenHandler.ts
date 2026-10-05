import fs from 'node:fs';

import { ERGO_CHAIN, NATIVE_RESIDENCY, TokenMap } from '@rosen-bridge/tokens';

import { minimumFeeConfigs } from '../configs';
import { freezeAvalancheFeePlan } from '../minimum-fee/avalancheFeePlan';
import { SupportedTokenConfig } from '../types';

class TokenHandler {
  private static instance: TokenHandler;
  protected tokenMap: TokenMap;
  protected supportedTokens: Array<SupportedTokenConfig>;
  private originalTokenMap: unknown;

  private constructor() {
    // do nothing
  }

  /**
   * initializes TokenHandler with tokens from the specified path
   * @param tokensPath path to tokens json file
   */
  static init = async (tokensPath: string): Promise<void> => {
    if (!TokenHandler.instance) {
      if (!fs.existsSync(tokensPath)) {
        throw new Error(`tokensMap file with path ${tokensPath} doesn't exist`);
      }
      TokenHandler.instance = new TokenHandler();
      const tokensJson: string = fs.readFileSync(tokensPath, 'utf8');
      const tokens = JSON.parse(tokensJson).tokens;
      const originalTokens = freezeAvalancheFeePlan(structuredClone(tokens));
      const tokenMap = new TokenMap();
      await tokenMap.updateConfigByJson(tokens);
      TokenHandler.instance.tokenMap = tokenMap;
      TokenHandler.instance.originalTokenMap = originalTokens;

      // initialize supported tokens
      const rawSupportedTokens = minimumFeeConfigs.supportedTokens;
      const supportedTokens: Array<SupportedTokenConfig> = [];

      for (const token of rawSupportedTokens) {
        const tokenSet = tokenMap.getTokenSet(token.tokenId);
        if (tokenSet === undefined) {
          throw new Error(`Token [${token.tokenId}] is not found in TokenMap`);
        }
        const significantDecimals = tokenMap.getSignificantDecimals(
          token.tokenId,
        );
        if (significantDecimals === undefined) {
          throw new Error(
            `ImpossibleBehavior: Failed to get significant decimals for token [${token.tokenId}]`,
          );
        }

        const ergoSideTokenId = tokenSet[ERGO_CHAIN].tokenId;
        const nativeChain = Object.keys(tokenSet).find(
          (chain) => tokenSet[chain].residency === NATIVE_RESIDENCY,
        );
        if (nativeChain === undefined) {
          throw new Error(
            `ImpossibleBehavior: Native chain for token [${token.tokenId}] is not found`,
          );
        }
        const name = tokenSet[nativeChain].name;

        supportedTokens.push({
          ...token,
          ergoSideTokenId: ergoSideTokenId,
          name: name,
          decimals: significantDecimals,
        });
      }

      TokenHandler.instance.supportedTokens = supportedTokens;
    }
  };

  /**
   * returns the TokenHandler instance if initialized
   * @returns TokenHandler instance
   */
  static getInstance = (): TokenHandler => {
    if (!TokenHandler.instance) {
      throw new Error('TokenHandler is not initialized');
    }
    return TokenHandler.instance;
  };

  /**
   * @returns the token map
   */
  getTokenMap = (): TokenMap => {
    return this.tokenMap;
  };

  /** Return the captured immutable original token map used to bind fee generation. */
  getOriginalTokenMap = (): unknown => this.originalTokenMap;

  /**
   * @returns the supported tokens
   */
  getSupportedTokens = (): Array<SupportedTokenConfig> => {
    return this.supportedTokens;
  };
}

export { TokenHandler };
