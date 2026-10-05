import { body, native } from './avalanchePublicationFixture';

/** Builds exact decimal-string Sigma Long fees for the V2 schema fixture. */
export const feeV2 = () => ({
  bridgeFee: '0',
  networkFee: '9007199254740993',
  rsnRatio: '1',
  rsnRatioDivisor: '10',
  feeRatio: '2',
});

/** Builds the V2 finalized quote, policy, history and independent asset/update evidence. */
export const evidenceV2 = () => ({
  finalized: { chainId: 43113, height: 100, hash: '0x' + 'ab'.repeat(32) },
  quote: {
    chainId: 43113,
    baseFeePerGas: '100',
    maxPriorityFeePerGas: '2',
    maxFeePerGas: '202',
  },
  policy: {
    gasBudget: '21000',
    margin: { numerator: '11', denominator: '10' },
    activationDelay: 0,
  },
  history: {
    chains: ['ergo', 'avalanche'],
    frontiers: { ergo: 90, avalanche: 100 },
    guarantees: { ergo: 10, avalanche: 20 },
  },
  assets: [
    {
      selectedTokenId: 'avax',
      ergoTokenId: native,
      activationHeight: 100,
      fee: feeV2(),
    },
  ],
  updates: [
    {
      selectedTokenId: 'avax',
      ergoTokenId: native,
      candidate: {
        heights: { ergo: 95, avalanche: 100 },
        configs: { ergo: feeV2(), avalanche: feeV2() },
      },
    },
  ],
});

/** Builds a transaction or empty V2 envelope from the independent V1 fixture. */
export const bodyV2 = (empty = false) => ({
  ...body(),
  version: 2,
  kind: empty ? 'empty' : 'transaction',
  transaction: empty
    ? null
    : { reducedTx: 'AQID', sender: '9'.repeat(51), inputs: ['BAUG'] },
  feeEvidence: { ...evidenceV2(), ...(empty ? { updates: [] } : {}) },
});

/** Replaces or removes one explicitly named nested evidence field without resealing. */
export const alterV2 = (
  value: object,
  path: string,
  replacement: unknown,
  remove = false,
) => {
  const keys = path.split('.');
  const key = keys.pop()!;
  const parent = keys.reduce<object>(
    (row, field) => Reflect.get(row, field),
    value,
  );
  if (remove) Reflect.deleteProperty(parent, key);
  else Reflect.set(parent, key, replacement);
};
