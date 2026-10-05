import { ErgoBox } from 'ergo-lib-wasm-nodejs';

import { DefaultLogger } from '@rosen-bridge/abstract-logger';

import { minimumFeeConfigs } from '../configs';
import { TokenHandler } from '../tokenMap/tokenHandler';
import { generateTransaction } from '../transaction/generate';
import { ConfigOrder } from '../transaction/types';
import { UpdatedFeeConfig } from '../types';
import {
  consumeAvalancheUpdatedConfigs,
  cloneAvalancheCandidate,
} from './avalancheFeeIntegration';

const logger = DefaultLogger.getInstance().child(import.meta.url);

export const updateConfigsTransaction = async (
  feeConfigs: Map<string, UpdatedFeeConfig>,
) => {
  const construction = consumeAvalancheUpdatedConfigs(feeConfigs);
  if (construction) {
    const { policy } = construction;
    const inputs = construction.entries.flatMap((entry) =>
      entry.current
        ? [ErgoBox.sigma_parse_bytes(Buffer.from(entry.current, 'base64'))]
        : [],
    );
    const order: ConfigOrder = construction.entries.map((entry) => ({
      address: policy.minimumFeeAddress,
      assets: {
        nativeToken: policy.minBoxErg,
        tokens: [
          { id: policy.minimumFeeNFT, value: 1n },
          ...(entry.tokenId === 'erg'
            ? []
            : [{ id: entry.ergoTokenId, value: 1n }]),
        ],
      },
      box: cloneAvalancheCandidate(entry.candidate, policy.minBoxErg),
    }));
    construction.assertFresh();
    return await generateTransaction(order, inputs, construction);
  }
  const inputs: Array<ErgoBox> = [];
  const order: ConfigOrder = [];
  for (const token of TokenHandler.getInstance().getSupportedTokens()) {
    const feeConfig = feeConfigs.get(token.tokenId);
    if (!feeConfig) continue;

    const currentConfigBox = feeConfig.current.getBox();

    if (!currentConfigBox)
      logger.warn(`found no current config box for token [${token.tokenId}]`);
    else inputs.push(currentConfigBox);

    const requiredTokens = [
      {
        id: minimumFeeConfigs.minimumFeeNFT,
        value: 1n,
      },
    ];
    if (token.tokenId !== 'erg')
      requiredTokens.push({
        id: token.ergoSideTokenId,
        value: 1n,
      });
    order.push({
      address: minimumFeeConfigs.minimumFeeAddress,
      assets: {
        nativeToken: minimumFeeConfigs.minBoxErg,
        tokens: requiredTokens,
      },
      box: feeConfig.new?.setValue(minimumFeeConfigs.minBoxErg).build(),
    });
  }

  return await generateTransaction(order, inputs);
};
