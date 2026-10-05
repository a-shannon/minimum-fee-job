import {
  AvalancheFeeQuote,
  AvalancheFinalizedBlock,
} from '../network/avalancheRpc';
import { AvalancheChainFee } from './avalancheChainFee';

/** Decimal strings are explicit input authority, not a claim about a price feed. */
export interface AvalancheFeePlanInput {
  readonly tokenMap: unknown;
  readonly avaxPrice: string;
  readonly assets: readonly {
    readonly selectedTokenId: string;
    readonly tokenPrice: string;
    readonly common: Omit<AvalancheChainFee, 'networkFee'>;
  }[];
}

export interface AvalancheFeePlan {
  readonly finalized: AvalancheFinalizedBlock;
  readonly quote: Readonly<AvalancheFeeQuote>;
  readonly assets: readonly Readonly<{
    selectedTokenId: string;
    ergoTokenId: string;
    activationHeight: number;
    fee: AvalancheChainFee;
  }>[];
}

/** Recursively freezes object values once, retaining shared references and cycles. */
export const freezeAvalancheFeePlan = <T>(
  value: T,
  seen = new WeakSet<object>(),
): T => {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value))
      freezeAvalancheFeePlan(child, seen);
    Object.freeze(value);
  }
  return value;
};

/** One full raw map and AVAX price snapshot for every asset in this run. */
export const captureAvalancheFeePlanInput = (
  input: AvalancheFeePlanInput,
): AvalancheFeePlanInput => {
  const assets = input.assets;
  if (!Array.isArray(assets) || assets.length === 0)
    throw new Error('Avalanche fee plan requires assets');
  return freezeAvalancheFeePlan(
    structuredClone({
      tokenMap: input.tokenMap,
      avaxPrice: input.avaxPrice,
      assets: Array.from(assets, (asset) => ({
        selectedTokenId: asset.selectedTokenId,
        tokenPrice: asset.tokenPrice,
        common: asset.common,
      })),
    }),
  );
};
