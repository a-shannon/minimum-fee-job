import { difference } from 'lodash-es';

import { DefaultLogger } from '@rosen-bridge/abstract-logger';
import { ChainFee, MinimumFeeConfig } from '@rosen-bridge/minimum-fee';

import {
  ADA,
  BNB,
  BTC,
  DOGE,
  ERG,
  ETH,
  FIRO,
  HNS,
  minimumFeeConfigs,
} from '../configs';
import {
  getBitcoinFeeRatio,
  getDogeFeeRatio,
  getEthereumFeeHistory,
  getFiroFeeRatio,
  getHandshakeFeeRatio,
} from '../network/clients';
import { TokenHandler } from '../tokenMap/tokenHandler';
import { Chains, SUPPORTED_CHAINS, SupportedTokenConfig } from '../types';
import { ERC20_TRANSFER_GAS, feeRatioDivisor } from '../utils/consts';
import { applyHighDecimal } from '../utils/utils';
import {
  beginAvalancheFeeGeneration,
  finishAvalancheFeeGeneration,
} from './avalancheFeeIntegration';

const logger = DefaultLogger.getInstance().child(import.meta.url);

export const generateNewFeeConfig = async (
  prices: Map<string, number>,
  chainHeights: Map<string, number>,
) => {
  const handler = TokenHandler.getInstance();
  const avalanche = beginAvalancheFeeGeneration(
    () => ({
      tokens: handler.getSupportedTokens(),
      rawMap: handler.getOriginalTokenMap(),
      currentRawMap: handler.getTokenMap().getRawConfig(),
    }),
    () => ({
      legacyNumericPrices: Array.from(prices),
      rsnTokenId: minimumFeeConfigs.RSNTokenId,
    }),
  );
  const capturedPrices = avalanche?.publicationInputs
    ? new Map(avalanche.publicationInputs.legacyNumericPrices)
    : prices;
  const supportedTokens =
    avalanche?.source.tokens ?? handler.getSupportedTokens();
  const newFeeConfigs: Map<string, MinimumFeeConfig> = new Map();

  const rsnTokenConfig = supportedTokens.find(
    (token) =>
      token.tokenId ===
      (avalanche?.publicationInputs?.rsnTokenId ??
        minimumFeeConfigs.RSNTokenId),
  );
  if (!rsnTokenConfig) throw Error(`Token [RSN] is not found in config`);
  const rsnPrice = capturedPrices.get(rsnTokenConfig.tokenId);
  if (!rsnPrice) throw Error(`RSN price is required`);

  logger.debug(`Fetching Bitcoin fee ratio`);
  const bitcoinFeeRatioMap = await getBitcoinFeeRatio();
  avalanche?.assertFresh();

  logger.debug(`Fetching Doge fee ratio`);
  const dogeFeeRatio = await getDogeFeeRatio();
  avalanche?.assertFresh();

  logger.debug(`Fetching Firo fee ratio`);
  const firoFeeRatio = await getFiroFeeRatio();
  avalanche?.assertFresh();

  logger.debug(`Fetching Handshake fee ratio`);
  const handshakeFeeRatio = await getHandshakeFeeRatio();
  avalanche?.assertFresh();

  logger.debug(
    `Fetching Ethereum fee history (for [${minimumFeeConfigs.ethereumAvgGasPricePeriod}] latest blocks)`,
  );
  const ethereumFeeHistory = await getEthereumFeeHistory();
  avalanche?.assertFresh();
  const ethereumAvgGasPrice =
    ethereumFeeHistory.baseFeePerGas.reduce(
      (acc, cur) => acc + BigInt(cur),
      0n,
    ) / BigInt(ethereumFeeHistory.baseFeePerGas.length);
  logger.debug(`Avg Ethereum gas price: ${ethereumAvgGasPrice}`);
  const estimatedEthereumNetworkFeeInWei = (
    ethereumAvgGasPrice * ERC20_TRANSFER_GAS
  ).toString();
  const ethereumNetworkFeeInEther =
    Number(applyHighDecimal(estimatedEthereumNetworkFeeInWei, 18)) *
    minimumFeeConfigs.ethereumNetworkFeeMultiplier;
  logger.debug(`Ethereum network fee in Ether: ${ethereumNetworkFeeInEther}`);

  for (const token of supportedTokens) {
    logger.debug(`Generating new config for token [${token.name}]`);

    const feeConfig = await feeConfigFromPrice(
      token.tokenId,
      capturedPrices,
      chainHeights,
      rsnPrice,
      rsnTokenConfig.decimals,
      token.decimals,
      token.fee,
      bitcoinFeeRatioMap,
      dogeFeeRatio,
      firoFeeRatio,
      handshakeFeeRatio,
      ethereumNetworkFeeInEther,
      avalanche !== undefined,
    );
    newFeeConfigs.set(token.tokenId, feeConfig);
  }
  await finishAvalancheFeeGeneration(avalanche, newFeeConfigs, chainHeights);
  return newFeeConfigs;
};

export const feeConfigFromPrice = async (
  tokenId: string,
  prices: Map<string, number>,
  chainHeights: Map<string, number>,
  rsnPrice: number,
  rsnDecimal: number,
  tokenDecimal: number,
  configs: SupportedTokenConfig['fee'],
  bitcoinFeeRatioMap: Record<string, number>,
  dogeFeeRatio: number,
  firoFeeRatio: number,
  handshakeFeeRatio: number,
  ethereumNetworkFeeInEther: number,
  avalancheEnabled = false,
): Promise<MinimumFeeConfig> => {
  const getCurrentHeight = (chain: Chains) => {
    const currentHeight = chainHeights.get(chain);
    if (!currentHeight)
      throw Error(
        `Impossible behavior: chain [${chain}] is supported but its height is not fetched`,
      );
    return currentHeight;
  };

  const tokenPrice = prices.get(tokenId);
  if (tokenPrice == undefined)
    throw Error(`Unexpected state: token price is missing`);

  // calculating bridge fee
  const bridgeFee = BigInt(
    Math.ceil((configs.bridgeFeeUSD / tokenPrice) * 10 ** tokenDecimal),
  );

  const tokenMapData = TokenHandler.getInstance().getTokenMap().getConfig();
  const tokenSet = tokenMapData.find((set) => {
    for (const chain of Object.keys(set)) {
      if (set[chain].tokenId === tokenId) return true;
    }
    return false;
  });
  if (!tokenSet)
    throw Error(
      `Unexpected state: token [${tokenId}] is not found in token map`,
    );
  const chains = Object.keys(tokenSet);
  logger.debug(`supported chains for token [${tokenId}]: ${chains}`);
  const unsupportedChains = difference(
    chains,
    avalancheEnabled ? [...SUPPORTED_CHAINS, 'avalanche'] : SUPPORTED_CHAINS,
  );
  if (unsupportedChains.length > 0)
    throw Error(
      `Failed to create Fee Config for token [${tokenId}]: Token exists on chains [${unsupportedChains.join(',')}] but they are not supported`,
    );

  // calculating rsn ratio
  const rsnRatioRaw =
    (tokenPrice * 10 ** rsnDecimal) / (rsnPrice * 10 ** tokenDecimal);
  logger.debug(`rsnRatioRaw: ${rsnRatioRaw}`);

  let rsnRatioString = rsnRatioRaw.toString();
  if (rsnRatioString.includes('e-')) {
    // ratio is in scientific notation
    const notationIndex = rsnRatioString.indexOf('e-') + 2;
    rsnRatioString =
      '0.' +
      '0'.repeat(Number(rsnRatioString.slice(notationIndex)) - 1) +
      rsnRatioString.slice(0, notationIndex - 2).replaceAll('.', '');
  }
  logger.debug(`rsnRatioString: ${rsnRatioString}`);
  const parts = rsnRatioString.split('.');

  let rsnRatioDivisorPower;
  const fixedRatio = rsnRatioRaw.toFixed();
  if (fixedRatio.length >= minimumFeeConfigs.rsnRatioPrecision)
    rsnRatioDivisorPower = 0;
  else if (Number(fixedRatio) > 0)
    rsnRatioDivisorPower =
      minimumFeeConfigs.rsnRatioPrecision - fixedRatio.length;
  else {
    if (parts.length === 1)
      throw Error(`ImpossibleBehavior: rsn ratio is zero!`);
    let i = 0;
    while (parts[1][i] === '0') i++;
    rsnRatioDivisorPower = minimumFeeConfigs.rsnRatioPrecision + i;
  }
  const rsnRatioDivisor = BigInt(10 ** rsnRatioDivisorPower);

  const parts1 = (
    (parts.length === 1 ? '' : parts[1]) + '0'.repeat(rsnRatioDivisorPower)
  ).substring(0, rsnRatioDivisorPower);
  const rsnRatio = BigInt(parts[0] + parts1);

  // calculating fee ratio
  const feeRatio = BigInt(configs.feeRatioFloat * feeRatioDivisor);

  // calculate chain-specific configs
  const newFeeConfig = new MinimumFeeConfig();

  //  ERGO
  const ergoHeight = getCurrentHeight(Chains.ERGO) + configs.delays.ergo;
  if (chains.includes(Chains.ERGO)) {
    const ergoNetworkFee = getErgoNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
    );
    const ergoFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: ergoNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.ERGO, ergoHeight, ergoFee);
  } else {
    newFeeConfig.setChainConfig(Chains.ERGO, ergoHeight, undefined);
  }

  //  CARDANO
  const cardanoHeight =
    getCurrentHeight(Chains.CARDANO) + configs.delays.cardano;
  if (chains.includes(Chains.CARDANO)) {
    const cardanoNetworkFee = getCardanoNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
    );
    const cardanoFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: cardanoNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.CARDANO, cardanoHeight, cardanoFee);
  } else {
    newFeeConfig.setChainConfig(Chains.CARDANO, cardanoHeight, undefined);
  }

  //  BITCOIN
  const bitcoinHeight =
    getCurrentHeight(Chains.BITCOIN) + configs.delays.bitcoin;
  if (chains.includes(Chains.BITCOIN)) {
    const bitcoinNetworkFee = getBitcoinNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
      bitcoinFeeRatioMap,
    );
    const bitcoinFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: bitcoinNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.BITCOIN, bitcoinHeight, bitcoinFee);
  } else {
    newFeeConfig.setChainConfig(Chains.BITCOIN, bitcoinHeight, undefined);
  }

  //  ETHEREUM
  const ethereumHeight =
    getCurrentHeight(Chains.ETHEREUM) + configs.delays.ethereum;
  if (chains.includes(Chains.ETHEREUM)) {
    const ethereumNetworkFee = getEthereumNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
      ethereumNetworkFeeInEther,
    );
    const ethereumFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: ethereumNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.ETHEREUM, ethereumHeight, ethereumFee);
  } else {
    newFeeConfig.setChainConfig(Chains.ETHEREUM, ethereumHeight, undefined);
  }

  //  BINANCE
  const binanceHeight =
    getCurrentHeight(Chains.BINANCE) + configs.delays.binance;
  if (chains.includes(Chains.BINANCE)) {
    const binanceNetworkFee = getBinanceNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
    );
    const binanceFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: binanceNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.BINANCE, binanceHeight, binanceFee);
  } else {
    newFeeConfig.setChainConfig(Chains.BINANCE, binanceHeight, undefined);
  }

  //  DOGE
  const dogeHeight = getCurrentHeight(Chains.DOGE) + configs.delays.doge;
  if (chains.includes(Chains.DOGE)) {
    const dogeNetworkFee = getDogeNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
      dogeFeeRatio,
    );
    const dogeFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: dogeNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.DOGE, dogeHeight, dogeFee);
  } else {
    newFeeConfig.setChainConfig(Chains.DOGE, dogeHeight, undefined);
  }

  //  BITCOIN_RUNES
  if (chains.includes(Chains.BITCOIN_RUNES)) {
    const bitcoinRunesNetworkFee = getBitcoinRunesNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
      bitcoinFeeRatioMap,
    );
    const bitcoinRunesFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: bitcoinRunesNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(
      Chains.BITCOIN_RUNES,
      bitcoinHeight,
      bitcoinRunesFee,
    );
  } else {
    newFeeConfig.setChainConfig(Chains.BITCOIN_RUNES, bitcoinHeight, undefined);
  }

  //  FIRO
  const firoHeight = getCurrentHeight(Chains.FIRO) + configs.delays.firo;
  if (chains.includes(Chains.FIRO)) {
    const firoNetworkFee = getFiroNetworkFee(
      prices,
      configs,
      tokenPrice,
      tokenDecimal,
      firoFeeRatio,
    );
    const firoFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: firoNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(Chains.FIRO, firoHeight, firoFee);
  } else {
    newFeeConfig.setChainConfig(Chains.FIRO, firoHeight, undefined);
  }

  //  HANDSHAKE
  const handshakeHeight =
    getCurrentHeight(Chains.HANDSHAKE) + configs.delays.handshake;
  if (chains.includes(Chains.HANDSHAKE)) {
    const handshakeNetworkFee = getHandshakeNetworkFee(
      prices,
      tokenPrice,
      tokenDecimal,
      handshakeFeeRatio,
    );
    const handshakeFee: ChainFee = {
      bridgeFee: bridgeFee,
      networkFee: handshakeNetworkFee,
      rsnRatio: rsnRatio,
      feeRatio: feeRatio,
      rsnRatioDivisor,
    };
    newFeeConfig.setChainConfig(
      Chains.HANDSHAKE,
      handshakeHeight,
      handshakeFee,
    );
  } else {
    newFeeConfig.setChainConfig(Chains.HANDSHAKE, handshakeHeight, undefined);
  }

  return newFeeConfig;
};

const getErgoNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
) => {
  const ergPrice = prices.get(ERG);
  if (!ergPrice) throw Error(`Erg price is required`);

  // calculating network fee on Ergo
  return BigInt(
    Math.ceil(
      (configs.ergNetworkFee * ergPrice * 10 ** tokenDecimal) / tokenPrice,
    ),
  );
};

const getCardanoNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
) => {
  const adaPrice = prices.get(ADA);
  if (!adaPrice) throw Error(`Ada price is required`);

  // calculating network fee on Cardano
  return BigInt(
    Math.ceil(
      (configs.adaNetworkFee * adaPrice * 10 ** tokenDecimal) / tokenPrice,
    ),
  );
};

const getBitcoinNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
  bitcoinFeeRatioMap: Record<string, number>,
) => {
  const btcPrice = prices.get(BTC);
  if (!btcPrice) throw Error(`Btc price is required`);

  // calculating network fee on Bitcoin
  const bitcoinFeeRatio = bitcoinFeeRatioMap[configs.bitcoinConfirmation];
  const bitcoinValue =
    bitcoinFeeRatio * minimumFeeConfigs.bitcoinTxVSize +
    minimumFeeConfigs.bitcoinMinUtxo * 10 ** 8;
  return BigInt(
    Math.ceil(
      (bitcoinValue * btcPrice * 10 ** tokenDecimal) / (tokenPrice * 10 ** 8),
    ),
  );
};

const getEthereumNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
  networkFeeInEther: number,
) => {
  const ethPrice = prices.get(ETH);
  if (!ethPrice) throw Error(`Eth price is required`);

  // calculating network fee on Ethereum
  return BigInt(
    Math.ceil((networkFeeInEther * ethPrice * 10 ** tokenDecimal) / tokenPrice),
  );
};

const getBinanceNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
) => {
  const bnbPrice = prices.get(BNB);
  if (!bnbPrice) throw Error(`Bnb price is required`);

  // calculating network fee on Binance
  return BigInt(
    Math.ceil(
      (minimumFeeConfigs.binanceTxFee * bnbPrice * 10 ** tokenDecimal) /
        tokenPrice,
    ),
  );
};

const getDogeNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
  dogeFeeRatio: number,
) => {
  const dogePrice = prices.get(DOGE);
  if (!dogePrice) throw Error(`Doge price is required`);

  // calculating network fee on Dogecoin
  const dogeValue =
    dogeFeeRatio * minimumFeeConfigs.dogeTxSize +
    minimumFeeConfigs.dogeMinUtxo * 10 ** 8;
  return BigInt(
    Math.ceil(
      (dogeValue * dogePrice * 10 ** tokenDecimal) / (tokenPrice * 10 ** 8),
    ),
  );
};

const getBitcoinRunesNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
  bitcoinFeeRatioMap: Record<string, number>,
) => {
  const btcPrice = prices.get(BTC);
  if (!btcPrice) throw Error(`Btc price is required`);

  // calculating network fee on Bitcoin
  const bitcoinFeeRatio = bitcoinFeeRatioMap[configs.bitcoinConfirmation];
  const bitcoinValue =
    bitcoinFeeRatio * minimumFeeConfigs.bitcoinRunesTxVSize +
    minimumFeeConfigs.bitcoinMinUtxo * 10 ** 8;
  return BigInt(
    Math.ceil(
      (bitcoinValue * btcPrice * 10 ** tokenDecimal) / (tokenPrice * 10 ** 8),
    ),
  );
};

const getFiroNetworkFee = (
  prices: Map<string, number>,
  configs: SupportedTokenConfig['fee'],
  tokenPrice: number,
  tokenDecimal: number,
  firoFeeRatio: number,
) => {
  const firoPrice = prices.get(FIRO);
  if (!firoPrice) throw Error(`Firo price is required`);

  // calculating network fee on Firo
  const firoValue =
    firoFeeRatio * minimumFeeConfigs.firoTxSize +
    minimumFeeConfigs.firoMinUtxo * 10 ** 8;
  return BigInt(
    Math.ceil(
      (firoValue * firoPrice * 10 ** tokenDecimal) / (tokenPrice * 10 ** 8),
    ),
  );
};

const getHandshakeNetworkFee = (
  prices: Map<string, number>,
  tokenPrice: number,
  tokenDecimal: number,
  handshakeFeeRatio: number,
) => {
  const handshakePrice = prices.get(HNS);
  if (!handshakePrice) throw Error(`Handshake price is required`);

  // calculating network fee on Handshake (1 HNS = 10^6 dollarydoos)
  const handshakeValue =
    handshakeFeeRatio * minimumFeeConfigs.handshakeTxSize +
    minimumFeeConfigs.handshakeMinUtxo * 10 ** 6;
  return BigInt(
    Math.ceil(
      (handshakeValue * handshakePrice * 10 ** tokenDecimal) /
        (tokenPrice * 10 ** 6),
    ),
  );
};
