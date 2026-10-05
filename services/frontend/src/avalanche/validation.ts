// Server module: the pinned minimum-fee codec uses the Node WASM implementation.
import * as wasm from 'ergo-lib-wasm-nodejs';
import { Buffer } from 'node:buffer';

import {
  extractFeeFromBox,
  feeToRegisterValues,
} from '@rosen-bridge/minimum-fee';

import {
  AvalancheFeeContract,
  parseAvalancheFeeTransaction,
  StructuralFeeBox,
} from './transaction';

export interface StructuralFeeRecord {
  readonly heights: Readonly<Record<string, number>>;
  readonly configs: Readonly<
    Record<
      string,
      Readonly<{
        bridgeFee: string;
        networkFee: string;
        rsnRatio: string;
        rsnRatioDivisor: string;
        feeRatio: string;
      }>
    >
  >;
}
export interface AvalancheFeeStructuralReport {
  readonly scope: 'transaction-structure-only';
  readonly publicationId: string;
  readonly kind: 'empty' | 'transaction';
  readonly contract: Readonly<AvalancheFeeContract>;
  readonly transactionId: string | null;
  readonly feeInputs: readonly Readonly<
    StructuralFeeBox & { readonly fees: readonly StructuralFeeRecord[] }
  >[];
  readonly feeOutputs: readonly Readonly<
    StructuralFeeBox & { readonly fees: readonly StructuralFeeRecord[] }
  >[];
}

/** Decodes fee registers, checks bounds and history order, and rejects lossy codec round trips. */
const inspect = (input: StructuralFeeBox) => {
  const box = wasm.ErgoBox.sigma_parse_bytes(
    Buffer.from(input.serialized, 'base64'),
  );
  const chainRegister = box.register_value(4);
  if (!chainRegister) throw new Error('Missing fee register');
  const chains = chainRegister.to_coll_coll_byte().map((bytes) => {
    const text = Buffer.from(bytes).toString('utf8');
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(text) ||
      ['constructor', 'prototype'].includes(text) ||
      !Buffer.from(text).equals(Buffer.from(bytes))
    )
      throw new Error('Invalid fee chain name');
    return text;
  });
  if (!chains.length || new Set(chains).size !== chains.length)
    throw new Error('Empty or duplicate fee chains');
  const fees = extractFeeFromBox(box);
  if (!fees.length) throw new Error('Empty fee history');
  const previous = new Map<string, number>();
  for (const fee of fees) {
    if (!Object.keys(fee.heights).length)
      throw new Error('Empty fee height row');
    for (const [chain, height] of Object.entries(fee.heights)) {
      if (
        !Number.isSafeInteger(height) ||
        height < 0 ||
        height > 2147483647 ||
        height < (previous.get(chain) ?? 0)
      )
        throw new Error('Invalid fee activation height');
      previous.set(chain, height);
    }
    for (const [chain, values] of Object.entries(fee.configs)) {
      if (!Object.hasOwn(fee.heights, chain))
        throw new Error('Fee has no activation height');
      for (const [field, value] of Object.entries(values))
        if (
          typeof value !== 'bigint' ||
          value < 0n ||
          value > (1n << 63n) - 1n ||
          (field === 'rsnRatioDivisor' && value === 0n)
        )
          throw new Error('Invalid Sigma Long fee field');
    }
  }
  // Detect information the permissive decoder would otherwise discard: extra
  // columns, inconsistent sentinels, duplicate labels and wrong Sigma types.
  const rebuilt = feeToRegisterValues(fees);
  for (let register = 4; register <= 9; register++) {
    const expected = rebuilt[`R${register}` as keyof typeof rebuilt];
    if (
      box.register_value(register)?.encode_to_base16() !==
      expected.encode_to_base16()
    )
      throw new Error('Noncanonical minimum-fee registers');
  }
  const serializedFees = fees.map((fee) =>
    Object.freeze({
      heights: Object.freeze({ ...fee.heights }),
      configs: Object.freeze(
        Object.fromEntries(
          Object.entries(fee.configs).map(([chain, values]) => [
            chain,
            Object.freeze({
              bridgeFee: values.bridgeFee.toString(),
              networkFee: values.networkFee.toString(),
              rsnRatio: values.rsnRatio.toString(),
              rsnRatioDivisor: values.rsnRatioDivisor.toString(),
              feeRatio: values.feeRatio.toString(),
            }),
          ]),
        ),
      ),
    }),
  );
  return Object.freeze({ ...input, fees: Object.freeze(serializedFees) });
};

/** Structural evidence only: no price, gas, freshness, script or signature claim. */
export const inspectAvalancheFeeStructure = (
  publication: unknown,
  contract: AvalancheFeeContract,
): AvalancheFeeStructuralReport => {
  const parsed = parseAvalancheFeeTransaction(publication, contract);
  return Object.freeze({
    scope: 'transaction-structure-only',
    publicationId: parsed.publicationId,
    kind: parsed.kind,
    contract: parsed.contract,
    transactionId: parsed.transactionId,
    feeInputs: Object.freeze(parsed.feeInputs.map(inspect)),
    feeOutputs: Object.freeze(parsed.feeOutputs.map(inspect)),
  });
};
