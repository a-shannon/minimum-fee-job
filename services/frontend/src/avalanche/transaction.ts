// Server module: the Node WASM codec must never run in the client bundle.
import * as wasm from 'ergo-lib-wasm-nodejs';
import { Buffer } from 'node:buffer';

import { AvalancheChainId, decodeAvalanchePublication } from './publication';

export interface AvalancheFeeContract {
  readonly expectedChainId: AvalancheChainId;
  readonly minimumFeeAddress: string;
  readonly minimumFeeNFT: string;
}
export interface StructuralFeeBox {
  readonly index: number;
  readonly boxId: string;
  readonly tokenId: string;
  readonly serialized: string;
}
export interface ParsedAvalancheFeeTransaction {
  readonly publicationId: string;
  readonly kind: 'empty' | 'transaction';
  readonly contract: Readonly<AvalancheFeeContract>;
  readonly transactionId: string | null;
  readonly transaction: null | Readonly<{
    reducedTx: string;
    sender: string;
    inputs: readonly string[];
  }>;
  readonly feeInputs: readonly StructuralFeeBox[];
  readonly feeOutputs: readonly StructuralFeeBox[];
}

/** Caller supplies trusted deployment identity; the publication cannot choose it. */
export const parseAvalancheFeeTransaction = (
  input: unknown,
  deployment: AvalancheFeeContract,
): ParsedAvalancheFeeTransaction => {
  const contract = Object.freeze({
    expectedChainId: deployment.expectedChainId,
    minimumFeeAddress: deployment.minimumFeeAddress,
    minimumFeeNFT: deployment.minimumFeeNFT,
  });
  if (
    typeof contract.minimumFeeAddress !== 'string' ||
    !contract.minimumFeeAddress ||
    typeof contract.minimumFeeNFT !== 'string' ||
    !/^[0-9a-f]{64}$/.test(contract.minimumFeeNFT) ||
    /^0+$/.test(contract.minimumFeeNFT)
  )
    throw new Error('Invalid trusted minimum-fee contract');
  const tree = wasm.Address.from_base58(contract.minimumFeeAddress)
    .to_ergo_tree()
    .to_base16_bytes();
  const publication = decodeAvalanchePublication(
    input,
    contract.expectedChainId,
  );
  const common = {
    publicationId: publication.publicationId,
    kind: publication.kind,
    contract,
  };
  if (publication.kind === 'empty')
    return Object.freeze({
      ...common,
      transactionId: null,
      transaction: null,
      feeInputs: Object.freeze([]),
      feeOutputs: Object.freeze([]),
    });
  const transaction = publication.transaction!;
  const bytes = Buffer.from(transaction.reducedTx, 'base64');
  const reduced = wasm.ReducedTransaction.sigma_parse_bytes(bytes);
  if (!Buffer.from(reduced.sigma_serialize_bytes()).equals(bytes))
    throw new Error('Noncanonical reduced transaction bytes');
  // Syntax only: neither address ownership nor a signature is established here.
  wasm.Address.from_base58(transaction.sender);
  const unsigned = reduced.unsigned_tx();
  if (unsigned.data_inputs().len() !== 0)
    throw new Error('Publication does not carry serialized data inputs');
  const inputs = unsigned.inputs();
  if (transaction.inputs.length !== inputs.len())
    throw new Error('Transaction input count differs from publication');
  const targets = new Set(
    publication.supportedTokens.map((token) => token.ergoSideTokenId),
  );
  /** Identifies a contract fee box and validates its NFT and supported target token. */
  const classify = (
    box: wasm.ErgoBox,
    index: number,
  ): StructuralFeeBox | undefined => {
    if (box.ergo_tree().to_base16_bytes() !== tree) return undefined;
    const tokens = box.tokens();
    if (
      (tokens.len() !== 1 && tokens.len() !== 2) ||
      tokens.get(0).id().to_str() !== contract.minimumFeeNFT ||
      tokens.get(0).amount().as_i64().to_str() !== '1'
    )
      throw new Error('Invalid minimum-fee box marker');
    const tokenId = tokens.len() === 1 ? 'erg' : tokens.get(1).id().to_str();
    if (
      !targets.has(tokenId) ||
      (tokens.len() === 2 && tokens.get(1).amount().as_i64().to_str() !== '1')
    )
      throw new Error('Invalid minimum-fee target token');
    return Object.freeze({
      index,
      boxId: box.box_id().to_str(),
      tokenId,
      serialized: Buffer.from(box.sigma_serialize_bytes()).toString('base64'),
    });
  };
  const feeInputs: StructuralFeeBox[] = [],
    feeOutputs: StructuralFeeBox[] = [];
  const inputIds = new Set<string>();
  for (let index = 0; index < inputs.len(); index++) {
    const serialized = Buffer.from(transaction.inputs[index], 'base64');
    const box = wasm.ErgoBox.sigma_parse_bytes(serialized);
    const id = box.box_id().to_str();
    if (
      !Buffer.from(box.sigma_serialize_bytes()).equals(serialized) ||
      id !== inputs.get(index).box_id().to_str() ||
      inputIds.has(id)
    )
      throw new Error('Transaction input bytes or order are inconsistent');
    inputIds.add(id);
    const fee = classify(box, index);
    if (fee) feeInputs.push(fee);
  }
  const outputs = unsigned.output_candidates();
  for (let index = 0; index < outputs.len(); index++) {
    const box = wasm.ErgoBox.from_box_candidate(
      outputs.get(index),
      unsigned.id(),
      index,
    );
    const fee = classify(box, index);
    if (fee) feeOutputs.push(fee);
  }
  if (!feeOutputs.length)
    throw new Error('Transaction contains no configured fee output');
  for (const boxes of [feeInputs, feeOutputs])
    if (new Set(boxes.map((box) => box.tokenId)).size !== boxes.length)
      throw new Error('Duplicate minimum-fee target');
  if (
    feeInputs.some(
      (box) => !feeOutputs.some((output) => output.tokenId === box.tokenId),
    )
  )
    throw new Error('Consumed fee target has no successor');
  return Object.freeze({
    ...common,
    transactionId: unsigned.id().to_str(),
    transaction,
    feeInputs: Object.freeze(feeInputs),
    feeOutputs: Object.freeze(feeOutputs),
  });
};
