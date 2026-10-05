import './bootstrap';

import { chunk } from 'lodash-es';

import { DefaultLogger } from '@rosen-bridge/abstract-logger';
import JsonBigInt from '@rosen-bridge/json-bigint';

import {
  RunningInterval,
  minimumFeeConfigs,
  kvRestApiUrl,
  tokensPath,
} from './configs';
import { initDataSource } from './database/initDataSource';
import {
  usesAvalancheFeePublication,
  validateAvalancheFeeStartup,
} from './minimum-fee/avalancheFeeIntegration';
import { generateNewFeeConfig } from './minimum-fee/newConfig';
import { getConfigTokenPrices } from './minimum-fee/prices';
import { publishAvalancheFee } from './minimum-fee/publication';
import { updateConfigsTransaction } from './minimum-fee/transaction';
import { updateAndGenerateFeeConfig } from './minimum-fee/updateConfig';
import {
  firoClient,
  getBinanceHeight,
  getBitcoinHeight,
  getCardanoHeight,
  getDogeHeight,
  getErgoHeight,
  getEthereumHeight,
  getFiroHeight,
  getHandshakeHeight,
} from './network/clients';
import { Notification } from './network/notification';
import {
  flushStore,
  saveTokensConfig,
  savePrices,
  saveTx,
  saveTokenMap,
  saveRsnTokenId,
  saveAvalanchePublication,
} from './store';
import { TokenHandler } from './tokenMap/tokenHandler';
import { Chains, DiscordPayloadType, UpdatedFeeConfig } from './types';
import { sendPriceFetchFailureNotification } from './utils/notifications';
import { saveTokenPrices } from './utils/saveTokenPrices';
import { feeConfigToRegisterValues, pricesToTables } from './utils/utils';

const logger = DefaultLogger.getInstance().child(import.meta.url);

const main = async () => {
  logger.info(`Starting Job`);
  if (minimumFeeConfigs.feeAddress === minimumFeeConfigs.minimumFeeAddress)
    throw Error(`Fee address and Minimum-fee config address cannot be equal`);

  const tokenHandler = TokenHandler.getInstance();
  const priceResult = await getConfigTokenPrices();
  await saveTokenPrices(priceResult.prices);

  if (!priceResult.fetched) {
    await sendPriceFetchFailureNotification(
      priceResult.prices,
      priceResult.errors,
    );
    return;
  }

  // fetch current network heights
  const chainHeights = new Map<Chains, number>();
  chainHeights.set(Chains.ERGO, await getErgoHeight());
  chainHeights.set(Chains.CARDANO, await getCardanoHeight());
  chainHeights.set(Chains.BITCOIN, await getBitcoinHeight());
  chainHeights.set(Chains.ETHEREUM, await getEthereumHeight());
  chainHeights.set(Chains.BINANCE, await getBinanceHeight());
  chainHeights.set(Chains.DOGE, await getDogeHeight());
  chainHeights.set(Chains.BITCOIN_RUNES, chainHeights.get(Chains.BITCOIN)!);
  chainHeights.set(Chains.FIRO, await getFiroHeight());
  chainHeights.set(Chains.HANDSHAKE, await getHandshakeHeight());

  // new config
  logger.info(`Generating new config`);
  const newFeeConfigs = await generateNewFeeConfig(
    priceResult.prices,
    chainHeights,
  );
  const avalanchePublication = usesAvalancheFeePublication(newFeeConfigs);

  newFeeConfigs.forEach((feeConfig, tokenId) => {
    logger.debug(
      `fee config for token [${tokenId}]: ${JsonBigInt.stringify(feeConfig)}`,
    );
    logger.debug(
      `Register values: ${JsonBigInt.stringify(
        feeConfigToRegisterValues([feeConfig.getConfig()]),
      )}`,
    );
  });

  // updated config
  logger.info(`Combining new config with current config`);
  const updateResult = await updateAndGenerateFeeConfig(
    newFeeConfigs,
    chainHeights,
  );
  const updatedConfigs = updateResult.config;
  const feeDifferences = updateResult.feeDifferences;

  updatedConfigs.forEach((updatedConfig: UpdatedFeeConfig, tokenId: string) => {
    const feeConfig = updatedConfig.new.getConfigs();
    logger.debug(
      `Updated fee config for token [${tokenId}]: ${JsonBigInt.stringify(
        feeConfig,
      )}`,
    );
    logger.debug(
      `Register values: ${JsonBigInt.stringify(
        feeConfigToRegisterValues(feeConfig),
      )}`,
    );
  });

  if (avalanchePublication) {
    const source =
      updatedConfigs.size === 0
        ? updatedConfigs
        : await updateConfigsTransaction(updatedConfigs);
    await publishAvalancheFee(source, saveAvalanchePublication);
    logger.info('Stored one Avalanche fee publication envelope');
    return;
  }

  if (updatedConfigs.size === 0) {
    logger.info(`No config need update`);

    if (kvRestApiUrl) {
      await flushStore();
      logger.info('Flushed store');
    }
  } else {
    const currentDate = new Date().toISOString().split('T')[0];
    // transaction
    logger.info(
      `updating config for tokens [${Array.from(updatedConfigs.keys())}]`,
    );
    const tx = JsonBigInt.stringify(
      await updateConfigsTransaction(updatedConfigs),
    );
    logger.info(`Transaction to update minimum-fee config box generated`);

    // send notification to discord
    const tables = pricesToTables(priceResult.prices, feeDifferences);
    const discordNotification = Notification.getInstance();
    await discordNotification.send(
      DiscordPayloadType.MESSAGE,
      `# MinimumFee configs need to be updated`,
    );
    await discordNotification.send(DiscordPayloadType.MESSAGE, `## Prices`);
    for (const chunk of tables.brief) {
      await discordNotification.send(
        DiscordPayloadType.MESSAGE,
        `\`\`\`ansi\n${chunk}\n\`\`\``,
      );
    }
    await discordNotification.send(DiscordPayloadType.FILE, tables.details, {
      filename: `prices.${currentDate}.md`,
    });
    const tokenIds = Array.from(updatedConfigs.keys());

    if (kvRestApiUrl) {
      // send info to redis
      const tokenIdChunks = chunk(
        tokenIds.map((tokenId) => {
          const token = tokenHandler
            .getSupportedTokens()
            .find((token) => token.tokenId === tokenId)!;
          return `- ${token.name} [\`${token.ergoSideTokenId}\`]`;
        }),
        15,
      ).map((chunk) => chunk.join('\n'));
      await discordNotification.send(
        DiscordPayloadType.MESSAGE,
        `## Changed Tokens`,
      );
      for (const chunk of tokenIdChunks) {
        await discordNotification.send(DiscordPayloadType.MESSAGE, chunk);
      }
      await Promise.all([
        saveTokensConfig(tokenHandler.getSupportedTokens()),
        saveTokenMap(tokenHandler.getTokenMap()),
        savePrices(priceResult.prices),
        saveTx(tx),
        saveRsnTokenId(minimumFeeConfigs.RSNTokenId),
      ]);
      logger.info('Saved data in the store');
    } else {
      // send info to discord
      for (const tokenId of tokenIds) {
        const token = tokenHandler
          .getSupportedTokens()
          .find((token) => token.tokenId === tokenId)!;
        await discordNotification.send(
          DiscordPayloadType.MESSAGE,
          `## Token ${token.name} [${token.tokenId}]
          Ergo side tokenId: \`${token.ergoSideTokenId}\`
        `,
        );
        const tokenFeeConfig = updatedConfigs.get(tokenId)!.new.getConfigs();
        await discordNotification.send(
          DiscordPayloadType.FILE,
          JsonBigInt.stringify(tokenFeeConfig, null, 2),
          { filename: `${token.name}.${currentDate}.json` },
        );
      }

      // send tx
      const n = Math.ceil(tx.length / 1500);
      const chunks = Array.from(tx.match(/.{1,1500}/g)!);
      await discordNotification.send(
        DiscordPayloadType.MESSAGE,
        `## Generated tx (chunks: ${n})`,
      );
      const txChunks: string[] = [];
      for (let i = 0; i < n; i++) {
        const txChunk = JsonBigInt.stringify({
          CSR: chunks[i],
          n: n,
          p: i + 1,
        });
        logger.info(`chunk [${i}]: ${txChunk}`);
        txChunks.push(txChunk);
      }
      for (const txChunk of txChunks) {
        await discordNotification.send(
          DiscordPayloadType.MESSAGE,
          `\`\`\`json\n${txChunk}\n\`\`\``,
        );
        logger.info('Sent data to discord');
      }
    }
  }

  logger.info(`Job done`);
};

const interval = () => {
  main()
    .then(() => {
      setTimeout(interval, RunningInterval);
    })
    .catch((e) => {
      logger.warn(`An error occurred: ${e}`);
      if (e instanceof Error && e.stack) logger.debug(e.stack);
      // send alert to discord
      const discordNotification = Notification.getInstance();
      discordNotification.send(
        DiscordPayloadType.MESSAGE,
        `# :warning: Error in Minimum Fee Job\n` + `\`\`\`json\n${e}\n\`\`\``,
      );
      setTimeout(interval, RunningInterval);
    });
};

const initializeService = async () => {
  validateAvalancheFeeStartup();
  await initDataSource();
  await TokenHandler.init(tokensPath);
  firoClient.setupSocket();
};

await initializeService();
interval();
