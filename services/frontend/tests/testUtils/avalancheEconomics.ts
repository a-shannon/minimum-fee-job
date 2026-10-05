import { pinnedFeeDependencies } from '../../../backend/tests/fixtures/pinnedFeeDependencies';
import { inspectAvalancheFeeEconomics } from '../../src/avalanche/economics';
import type {
  TrustedAvalancheFeePolicy,
  TrustedAvalancheFeeObservations,
} from '../../src/avalanche/economics';
import type { AvalancheFeeRecord } from '../../src/avalanche/publication';
import { native, seal } from './avalanchePublicationFixture';
import { setupStructure, nft } from './avalancheStructure';

/** Builds canonical real fee boxes with separately supplied policy and observations. */
export const economicsFixture = (
  options: {
    existing?: boolean;
    chainId?: 43113 | 43114;
    inputRows?: AvalancheFeeRecord[];
    outputRows?: AvalancheFeeRecord[];
  } = {},
) => {
  const f = setupStructure();
  const codec = pinnedFeeDependencies().fees;
  const chainId = options.chainId ?? 43113;
  const common = {
    bridgeFee: '1',
    rsnRatio: '2',
    rsnRatioDivisor: '1000',
    feeRatio: '3',
  };
  const candidate: AvalancheFeeRecord = {
    heights: { avalanche: 105, ergo: 105 },
    configs: {
      avalanche: { ...common, networkFee: '3000000000' },
      ergo: { ...common, networkFee: '9' },
    },
  };
  const old: AvalancheFeeRecord = {
    heights: { avalanche: 90, ergo: 90 },
    configs: {
      avalanche: { ...common, networkFee: '1' },
      ergo: { ...common, networkFee: '1' },
    },
  };
  const inputRows = options.inputRows ?? [old];
  /** Builds a fee candidate from every history row, converting decimal fee fields to bigint. */
  const candidateBox = (rows: readonly AvalancheFeeRecord[]) => {
    const builder = new codec.MinimumFeeBoxBuilder(nft, f.address)
      .setHeight(100)
      .setToken(native)
      .setValue(1000000n);
    for (const row of rows)
      builder.addConfig(
        new codec.MinimumFeeConfig({
          heights: { ...row.heights },
          configs: Object.fromEntries(
            Object.entries(row.configs).map(([chain, config]) => [
              chain,
              Object.fromEntries(
                Object.entries(config).map(([key, value]) => [
                  key,
                  BigInt(value),
                ]),
              ),
            ]),
          ),
        }),
      );
    return builder.build();
  };
  const existing = options.existing ?? false;
  const prior = f.wasm.ErgoBox.from_box_candidate(
    candidateBox(inputRows),
    f.wasm.TxId.zero(),
    5,
  );
  const outputRows =
    options.outputRows ?? (existing ? [...inputRows, candidate] : [candidate]);
  const built = f.build(
    [f.normal, candidateBox(outputRows)],
    existing ? [f.funding, prior] : [f.funding],
  );
  const policy: TrustedAvalancheFeePolicy = {
    contract: { ...f.contract, expectedChainId: chainId },
    rawTokenMap: structuredClone(built.body.rawTokenMap),
    selectedTokenIds: ['avax'],
    gasBudget: '1000000000000000000',
    margin: { numerator: '1', denominator: '1' },
    activationDelay: 5,
    history: {
      chains: ['avalanche', 'ergo'],
      guarantees: { avalanche: 20, ergo: 20 },
    },
    common: { avax: common },
  };
  const observations: TrustedAvalancheFeeObservations = {
    finalized: { chainId, height: 100, hash: '0x' + '01'.repeat(32) },
    quote: {
      chainId,
      baseFeePerGas: '1',
      maxPriorityFeePerGas: '1',
      maxFeePerGas: '3',
    },
    frontiers: { avalanche: 100, ergo: 100 },
    prices: { avax: '2', tokens: { avax: '2' } },
    priorFeeBoxes: {
      [native]: existing
        ? Buffer.from(prior.sigma_serialize_bytes()).toString('base64')
        : null,
    },
  };
  const body = {
    ...built.body,
    version: 2,
    chainId,
    avalancheDecimalPrices: structuredClone(observations.prices),
    feeEvidence: {
      finalized: structuredClone(observations.finalized),
      quote: structuredClone(observations.quote),
      policy: {
        gasBudget: policy.gasBudget,
        margin: structuredClone(policy.margin),
        activationDelay: 5,
      },
      history: {
        chains: [...policy.history.chains],
        guarantees: { ...policy.history.guarantees },
        frontiers: { ...observations.frontiers },
      },
      assets: [
        {
          selectedTokenId: 'avax',
          ergoTokenId: native,
          activationHeight: 105,
          fee: { ...candidate.configs.avalanche },
        },
      ],
      updates: [
        {
          selectedTokenId: 'avax',
          ergoTokenId: native,
          candidate: structuredClone(candidate),
        },
      ],
    },
  };
  return {
    f,
    body,
    packet: seal(body),
    policy,
    observations,
    candidate,
    old,
    prior,
    candidateBox,
  };
};

/** Seals the current fixture body and checks it against independent inputs. */
export const check = (f: ReturnType<typeof economicsFixture>) =>
  inspectAvalancheFeeEconomics(seal(f.body), f.policy, f.observations);
/** Rebuilds reduced transaction bytes from the supplied output history rows. */
export const output = (
  f: ReturnType<typeof economicsFixture>,
  rows: AvalancheFeeRecord[],
  existing = false,
) => {
  f.body.transaction = f.f.build(
    [f.f.normal, f.candidateBox(rows)],
    existing ? [f.f.funding, f.prior] : [f.f.funding],
  ).body.transaction;
};
/** Aligns fee evidence and real output bytes to the supplied network fee. */
export const alignFee = (
  f: ReturnType<typeof economicsFixture>,
  networkFee: string,
) => {
  Object.assign(f.body.feeEvidence.assets[0].fee, { networkFee });
  Object.assign(f.body.feeEvidence.updates[0].candidate.configs.avalanche, {
    networkFee,
  });
  output(f, [f.body.feeEvidence.updates[0].candidate]);
};
