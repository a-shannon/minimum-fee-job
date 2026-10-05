import { isEqual } from 'lodash-es';

import { DefaultLogger } from '@rosen-bridge/abstract-logger';
import JsonBigInt from '@rosen-bridge/json-bigint';
import {
  ErgoNetworkType,
  Fee,
  MinimumFeeBox,
  MinimumFeeBoxBuilder,
  MinimumFeeConfig,
} from '@rosen-bridge/minimum-fee';

import {
  bridgeFeeTriggerPercent,
  feeGuaranteeDuration,
  minimumFeeConfigs,
  networkFeeTriggerPercent,
  rsnRatioTriggerPercent,
  urls,
} from '../configs';
import { TokenHandler } from '../tokenMap/tokenHandler';
import { Chains, FeeDifferencePercents, UpdatedFeeConfig } from '../types';
import { SUPPORTED_CHAINS } from '../utils/consts';
import {
  getConfigDifferencePercent,
  isDifferencePercentSufficient,
} from '../utils/utils';
import {
  consumeAvalancheFeeGeneration,
  assertAvalancheFeeHistory,
  avalancheFeeChangeRequired,
  bindAvalancheUpdatedConfigs,
} from './avalancheFeeIntegration';

const logger = DefaultLogger.getInstance().child(import.meta.url);

export const updateAndGenerateFeeConfig = async (
  newConfigs: Map<string, MinimumFeeConfig>,
  chainHeights: Map<string, number>,
) => {
  const avalanche = consumeAvalancheFeeGeneration(newConfigs, chainHeights);
  const updatedFeeConfigs: Map<string, UpdatedFeeConfig> = new Map();
  const feeDifferences: Map<string, FeeDifferencePercents | undefined> =
    new Map();
  for (const token of avalanche?.generation.source.tokens ??
    TokenHandler.getInstance().getSupportedTokens()) {
    logger.debug(`Combining old and new config of token [${token.name}]`);
    const newConfig = newConfigs.get(token.tokenId)!;

    const result = await updateFeeConfig(
      token.ergoSideTokenId,
      newConfig,
      chainHeights,
      avalanche,
    );
    const feeConfig = result.config;
    feeDifferences.set(token.tokenId, result.differencePercent);
    if (feeConfig.new)
      updatedFeeConfigs.set(token.tokenId, {
        current: feeConfig.current,
        new: feeConfig.new,
      });
  }
  avalanche?.assertFresh();
  bindAvalancheUpdatedConfigs(avalanche, updatedFeeConfigs);
  return {
    config: updatedFeeConfigs,
    feeDifferences: feeDifferences,
  };
};

const updateFeeConfig = async (
  tokenId: string,
  newFeeConfig: MinimumFeeConfig,
  chainHeights: Map<string, number>,
  avalanche: ReturnType<typeof consumeAvalancheFeeGeneration>,
): Promise<{
  config: {
    current: MinimumFeeBox;
    new: MinimumFeeBoxBuilder | undefined;
  };
  differencePercent: FeeDifferencePercents | undefined;
}> => {
  const tokenMinimumFeeBox = new MinimumFeeBox(
    tokenId,
    minimumFeeConfigs.minimumFeeNFT,
    ErgoNetworkType.explorer,
    urls.ergoExplorer,
    logger,
  );
  for (let i = 0; i < minimumFeeConfigs.fetchBoxRetry; i++) {
    const res = await tokenMinimumFeeBox.fetchBox();
    if (res) break;
  }
  const box = tokenMinimumFeeBox.getBox();
  avalanche?.assertFresh();
  // MinimumFeeBoxBuilder.prune mutates rows; preserve the captured candidate batch.
  const candidateForBuilder = avalanche
    ? new MinimumFeeConfig(structuredClone(newFeeConfig.getConfig()))
    : newFeeConfig;
  if (box) {
    logger.debug(`Found a config for token [${tokenId}]`);
    const builder = await cleanOldConfig(
      tokenMinimumFeeBox,
      chainHeights,
      avalanche,
    );
    avalanche?.assertFresh();

    // calculate config differences
    const differencePercent = getConfigDifferencePercent(
      builder.getConfigs().at(-1)!,
      newFeeConfig.getConfig(),
    );

    // check any chain is added or removed
    const currentActiveChains = getConfigActiveChains(builder.getConfigs());
    const newActiveChains = getConfigActiveChains([newFeeConfig.getConfig()]);
    const isChainAddedOrRemoved = !isEqual(
      currentActiveChains,
      newActiveChains,
    );
    // check if fee difference is sufficient for update
    const isFeeDifferenceSufficient =
      avalancheFeeChangeRequired(
        avalanche,
        builder.getConfigs().at(-1)!,
        newFeeConfig.getConfig(),
      ) ||
      isDifferencePercentSufficient(
        Number(differencePercent.bridgeFee.value),
        bridgeFeeTriggerPercent,
        differencePercent.bridgeFee.direction,
      ) ||
      isDifferencePercentSufficient(
        Number(differencePercent.rsnRatio.value),
        rsnRatioTriggerPercent,
        differencePercent.rsnRatio.direction,
      ) ||
      SUPPORTED_CHAINS.some(
        (chain) =>
          differencePercent.networkFee[chain] !== undefined &&
          isDifferencePercentSufficient(
            Number(differencePercent.networkFee[chain]!.value),
            networkFeeTriggerPercent[chain]!,
            differencePercent.networkFee[chain]!.direction,
          ),
      );

    logger.debug(
      `trigger condition for token [${tokenId}]: [chainAddedOrRemoved: ${isChainAddedOrRemoved}] [feeDifferenceSufficient: ${isFeeDifferenceSufficient}]`,
    );
    if (!isChainAddedOrRemoved && !isFeeDifferenceSufficient) {
      logger.debug(
        `token [${tokenId}] config difference is not sufficient for update`,
      );
      return {
        config: {
          current: tokenMinimumFeeBox,
          new: undefined,
        },
        differencePercent: differencePercent,
      };
    }

    if (isChainAddedOrRemoved) {
      logger.debug(
        `chain differences for token [${tokenId}]: ${JsonBigInt.stringify([
          [currentActiveChains, newActiveChains],
        ])}`,
      );
    }
    if (isFeeDifferenceSufficient) {
      logger.debug(
        `fee differences for token [${tokenId}]: ${JsonBigInt.stringify([
          [differencePercent.bridgeFee, bridgeFeeTriggerPercent],
          [differencePercent.rsnRatio, rsnRatioTriggerPercent],
          ...SUPPORTED_CHAINS.map((chain) => [
            differencePercent.networkFee[chain],
            networkFeeTriggerPercent[chain],
          ]),
        ])}`,
      );
    }
    // add new config
    builder.addConfig(candidateForBuilder).prune();
    return {
      config: {
        current: tokenMinimumFeeBox,
        new: builder,
      },
      differencePercent: differencePercent,
    };
  } else {
    logger.debug(
      `No config found for token [${tokenId}]. Generating config with only the new one...`,
    );
    const currentErgoHeight = chainHeights.get(Chains.ERGO)!;

    const builder = new MinimumFeeBoxBuilder(
      minimumFeeConfigs.minimumFeeNFT,
      minimumFeeConfigs.minimumFeeAddress,
    );
    builder
      .setHeight(currentErgoHeight)
      .setToken(tokenId)
      .setValue(minimumFeeConfigs.minBoxErg)
      .addConfig(candidateForBuilder)
      .prune();

    return {
      config: {
        current: tokenMinimumFeeBox,
        new: builder,
      },
      differencePercent: undefined,
    };
  }
};

const cleanOldConfig = async (
  tokenMinimumFeeBox: MinimumFeeBox,
  chainHeights: Map<string, number>,
  avalanche: ReturnType<typeof consumeAvalancheFeeGeneration>,
) => {
  /** Read the fetched chain height and refuse missing heights while allowing finalized Avalanche height zero. */
  const getCurrentHeight = (chain: string) => {
    const currentHeight = chainHeights.get(chain);
    if (
      currentHeight === undefined ||
      (chain !== 'avalanche' && !currentHeight)
    )
      throw Error(
        `Impossible behavior: chain [${chain}] is supported but its height is not fetched`,
      );
    return currentHeight;
  };

  // convert to builder
  const builder = tokenMinimumFeeBox.toBuilder();
  builder.setHeight(getCurrentHeight(Chains.ERGO));
  const fees = builder.getConfigs();
  assertAvalancheFeeHistory(avalanche, fees);
  const chains = avalanche
    ? [...SUPPORTED_CHAINS, 'avalanche']
    : SUPPORTED_CHAINS;

  // remove unused configs
  let i = 0;
  let configIsPassed = false;
  for (i = fees.length - 1; i >= 0; i--) {
    for (const chain of chains) {
      const currentHeight = getCurrentHeight(chain);
      if (
        Object.hasOwn(fees[i].heights, chain) &&
        (chain === 'avalanche'
          ? fees[i].heights[chain] < currentHeight
          : fees[i].heights[chain] <= currentHeight)
      ) {
        configIsPassed = true;
        break;
      }
    }
    if (configIsPassed) break;
    builder.removeConfig(i);
  }

  // remove old configs
  let allHeightsAreSafeToRemove = false;
  for (; i >= 0; i--) {
    if (allHeightsAreSafeToRemove) builder.removeConfig(i);

    const heightsAreNotSafe = chains.some((chain) => {
      const currentHeight = getCurrentHeight(chain);
      const feeGuaranteeGap =
        chain === 'avalanche'
          ? avalanche!.generation.policy.guarantee
          : feeGuaranteeDuration.get(chain);
      if (!feeGuaranteeGap)
        throw Error(
          `Impossible behavior: chain [${chain}] is supported but its fee guarantee gap is not set`,
        );

      if (Object.hasOwn(fees[i].heights, chain))
        return fees[i].heights[chain] >= currentHeight - feeGuaranteeGap;
      else return false;
    });
    if (!heightsAreNotSafe) allHeightsAreSafeToRemove = true;
  }

  return builder;
};

const getConfigActiveChains = (fees: Fee[]): string[] => {
  const activeChains: Set<string> = new Set();
  for (let i = 0; i < fees.length; i++) {
    const chains = Object.keys(fees[i].heights);
    chains.forEach((chain) => {
      const feeConfig = fees[i].configs[chain];
      if (
        feeConfig &&
        (feeConfig.bridgeFee !== -1n ||
          feeConfig.networkFee !== -1n ||
          feeConfig.rsnRatio !== -1n ||
          feeConfig.rsnRatioDivisor !== -1n ||
          feeConfig.feeRatio !== -1n)
      )
        activeChains.add(chain);
    });
  }
  return Array.from(activeChains.values()).sort();
};
