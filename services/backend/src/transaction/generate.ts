import * as wasm from 'ergo-lib-wasm-nodejs';

import { DefaultLogger } from '@rosen-bridge/abstract-logger';
import { ErgoBoxSelection } from '@rosen-bridge/ergo-box-selection';
import JsonBigInt from '@rosen-bridge/json-bigint';

import { minimumFeeConfigs } from '../configs';
import {
  AvalancheFeeConstruction,
  avalancheBoxBytes,
  avalancheCandidateBytes,
  cloneAvalancheCandidate,
  enterAvalancheFeeConstruction,
  bindAvalancheFeeTransaction,
} from '../minimum-fee/avalancheFeeIntegration';
import {
  getAddressBoxes,
  getErgoHeight,
  getStateContext,
} from '../network/clients';
import { AssetBalance, ConfigOrder, TransactionEIP19 } from './types';
import { getBoxAssets, subtractAssetBalance, sumAssetBalance } from './utils';

const logger = DefaultLogger.getInstance().child(import.meta.url);
const boxSelection = new ErgoBoxSelection(
  DefaultLogger.getInstance().child(`ergo-box-selection`),
);

/**
 * generates unsigned transaction for config order
 * @param order the order order (list of single payments)
 * @param inputs the inputs for transaction
 * @returns the generated transaction
 */
export const generateTransaction = async (
  order: ConfigOrder,
  inputs: Array<wasm.ErgoBox>,
  construction?: AvalancheFeeConstruction,
): Promise<TransactionEIP19> => {
  enterAvalancheFeeConstruction(construction);
  const policy = construction?.policy ?? minimumFeeConfigs;
  const suppliedOrder = order;
  const suppliedInputs = inputs;
  /** Serialize the supplied payment order with exact assets and canonical candidate bytes for later freshness checks. */
  const orderIdentity = () =>
    JsonBigInt.stringify(
      suppliedOrder.map((row) => ({
        address: row.address,
        assets: row.assets,
        box: avalancheCandidateBytes(row.box),
      })),
    );
  /** Serialize the supplied input boxes in order using their canonical bytes for later freshness checks. */
  const inputIdentity = () =>
    JsonBigInt.stringify(suppliedInputs.map(avalancheBoxBytes));
  const capturedOrder = construction ? orderIdentity() : undefined;
  const capturedInputs = construction ? inputIdentity() : undefined;
  /** Recheck the construction permit and refuse changes to the captured order or input boxes. */
  const assertFresh = () => {
    construction?.assertFresh();
    if (
      construction &&
      (orderIdentity() !== capturedOrder || inputIdentity() !== capturedInputs)
    )
      throw new Error('Avalanche transaction construction inputs changed');
  };
  if (construction) {
    const expectedOrder = construction.entries.map((entry) => ({
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
      box: avalancheCandidateBytes(
        cloneAvalancheCandidate(entry.candidate, policy.minBoxErg),
      ),
    }));
    if (
      JsonBigInt.stringify(expectedOrder) !== capturedOrder ||
      JsonBigInt.stringify(
        construction.entries.flatMap((entry) =>
          entry.current ? [entry.current] : [],
        ),
      ) !== capturedInputs
    )
      throw new Error(
        'Avalanche transaction order does not match bound fee plan',
      );
    order = order.map((row) => ({
      address: row.address,
      assets: structuredClone(row.assets),
      box: cloneAvalancheCandidate(avalancheCandidateBytes(row.box)),
    }));
    inputs = inputs.map((box) =>
      wasm.ErgoBox.sigma_parse_bytes(
        Buffer.from(avalancheBoxBytes(box), 'base64'),
      ),
    );
    const expectedTree = wasm.Address.from_base58(policy.minimumFeeAddress)
      .to_ergo_tree()
      .to_base16_bytes();
    for (const row of order)
      if (
        row.box.ergo_tree().to_base16_bytes() !== expectedTree ||
        JsonBigInt.stringify(getBoxAssets(row.box)) !==
          JsonBigInt.stringify(row.assets)
      )
        throw new Error('Avalanche fee output differs from transaction policy');
  }
  logger.debug(
    `Generating Ergo transaction for Order: ${JsonBigInt.stringify(order)}`,
  );
  // calculate required assets
  const orderRequiredAssets = order
    .map((order) => order.assets)
    .reduce(sumAssetBalance, { nativeToken: 0n, tokens: [] });
  logger.debug(
    `Order required assets: ${JsonBigInt.stringify(orderRequiredAssets)}`,
  );
  const inputAssets = inputs
    .map((box) => boxSelection.getBoxInfo(box).assets)
    .reduce(sumAssetBalance, { nativeToken: 0n, tokens: [] });
  logger.debug(
    `Pre-selected boxes assets: ${JsonBigInt.stringify(inputAssets)}`,
  );
  const requiredAssets = subtractAssetBalance(
    orderRequiredAssets,
    inputAssets,
    0n,
    true,
  );
  logger.debug(`Required assets: ${JsonBigInt.stringify(requiredAssets)}`); // it does not consider required Erg for change box and tx fee, which is calculated by the selection package

  // call getCovering to get enough boxes
  const addressBoxes = await getAddressBoxes(policy.feeAddress);
  assertFresh();
  const ownedAddressBoxes = construction
    ? addressBoxes.map((box) =>
        wasm.ErgoBox.sigma_parse_bytes(
          Buffer.from(avalancheBoxBytes(box), 'base64'),
        ),
      )
    : addressBoxes;
  const coveredBoxes = await boxSelection.getCoveringBoxes(
    requiredAssets,
    [],
    new Map(),
    ownedAddressBoxes.values(),
    policy.minBoxErg,
    undefined,
    () => policy.txFee,
  );
  assertFresh();

  // check if boxes covered requirements
  if (!coveredBoxes.covered) {
    const neededErgs = requiredAssets.nativeToken.toString();
    const neededTokens = JsonBigInt.stringify(requiredAssets.tokens);
    throw new Error(
      `Available boxes didn't cover required assets. Erg: ${neededErgs}, Tokens: ${neededTokens}`,
    );
  }

  // add boxes to input list
  inputs.push(
    ...(construction
      ? coveredBoxes.boxes.map((box) =>
          wasm.ErgoBox.sigma_parse_bytes(
            Buffer.from(avalancheBoxBytes(box), 'base64'),
          ),
        )
      : coveredBoxes.boxes),
  );

  // generate input boxes objects
  let remainingAssets: AssetBalance = {
    nativeToken: 0n,
    tokens: [],
  };
  const inErgoBoxes = wasm.ErgoBoxes.empty();
  inputs.forEach((box) => {
    inErgoBoxes.add(box);

    // add box assets to `remainingAssets`
    remainingAssets = sumAssetBalance(remainingAssets, getBoxAssets(box));
  });
  logger.debug(`Input assets: ${JsonBigInt.stringify(remainingAssets)}`);

  // generate output boxes objects
  const outBoxCandidates = wasm.ErgoBoxCandidates.empty();
  const currentHeight = await getErgoHeight();
  assertFresh();
  if (
    construction &&
    (!Number.isSafeInteger(currentHeight) ||
      currentHeight < 0 ||
      currentHeight > 2147483647)
  )
    throw new Error('Invalid Ergo construction height');
  order.forEach((order) => {
    // build and add box
    const box = order.box;
    outBoxCandidates.add(box);

    // reduce box assets from `remainingAssets`
    remainingAssets = subtractAssetBalance(
      remainingAssets,
      getBoxAssets(box),
      policy.minBoxErg,
    );
  });
  logger.debug(`Remaining assets: ${JsonBigInt.stringify(remainingAssets)}`);

  // create change box
  const boxBuilder = new wasm.ErgoBoxCandidateBuilder(
    wasm.BoxValue.from_i64(
      wasm.I64.from_str(
        (remainingAssets.nativeToken - policy.txFee).toString(),
      ),
    ),
    wasm.Contract.new(
      wasm.Address.from_base58(policy.feeAddress).to_ergo_tree(),
    ),
    currentHeight,
  );
  // add change box tokens
  remainingAssets.tokens.forEach((token) =>
    boxBuilder.add_token(
      wasm.TokenId.from_str(token.id),
      wasm.TokenAmount.from_i64(wasm.I64.from_str(token.value.toString())),
    ),
  );
  // build and add change box
  const changeBox = boxBuilder.build();
  outBoxCandidates.add(changeBox);

  // create the box selector in tx builder
  const inBoxSelection = new wasm.BoxSelection(
    inErgoBoxes,
    new wasm.ErgoBoxAssetsDataList(),
  );

  // create the transaction
  assertFresh();
  const txCandidate = wasm.TxBuilder.new(
    inBoxSelection,
    outBoxCandidates,
    currentHeight,
    wasm.BoxValue.from_i64(wasm.I64.from_str(policy.txFee.toString())),
    wasm.Address.from_base58(policy.feeAddress),
  );
  const tx = txCandidate.build();

  // create ReducedTransaction object
  const ctx = await getStateContext();
  assertFresh();
  const reducedTx = wasm.ReducedTransaction.from_unsigned_tx(
    tx,
    inErgoBoxes,
    wasm.ErgoBoxes.empty(),
    ctx,
  );

  // create PaymentTransaction object
  const serializedTx = Buffer.from(reducedTx.sigma_serialize_bytes()).toString(
    'base64',
  );
  const ergoTx: TransactionEIP19 = {
    reducedTx: serializedTx,
    sender: policy.feeAddress,
    inputs: inputs.map((input) =>
      Buffer.from(input.sigma_serialize_bytes()).toString('base64'),
    ),
  };

  assertFresh();
  return construction
    ? bindAvalancheFeeTransaction(construction, ergoTx)
    : ergoTx;
};
