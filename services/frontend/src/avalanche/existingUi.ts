import type { Fee } from '@rosen-bridge/minimum-fee';

import type { loadAvalanchePublication } from '../store/avalanchePublication';
import type { ValidationResultOk } from '../types';

/** Selects the atomic publication path and refuses malformed opt-in settings. */
export const avalancheUiRequested = () => {
  const enabled = process.env.NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED;
  if (enabled === undefined || enabled === 'false') return false;
  if (
    enabled !== 'true' ||
    !['43113', '43114'].includes(
      process.env.NEXT_PUBLIC_AVALANCHE_CHAIN_ID ?? '',
    )
  )
    throw new Error('Avalanche publication is unavailable');
  return true;
};

/** Admits only an actual V2 transaction with both bound server reviews. */
export const requireReviewedAvalancheUi = (
  result: Awaited<ReturnType<typeof loadAvalanchePublication>>,
  expectedPublicationId?: string,
) => {
  const { publication, review, economicReview } = result;
  if (
    result.error ||
    !publication ||
    publication.version !== 2 ||
    publication.kind !== 'transaction' ||
    !publication.transaction ||
    review?.status !== 'reviewed' ||
    economicReview?.status !== 'compared' ||
    review.report.kind !== 'transaction' ||
    review.report.publicationId !== publication.publicationId ||
    economicReview.report.publicationId !== publication.publicationId ||
    economicReview.report.transactionId !== review.report.transactionId ||
    (expectedPublicationId !== undefined &&
      expectedPublicationId !== publication.publicationId)
  )
    throw new Error('Avalanche publication is unavailable');
  return {
    publication,
    review: review.report,
    economics: economicReview.report,
  };
};

/** Projects the reviewed output rows without reparsing or changing their indices. */
export const avalancheUiFeesByToken = (
  snapshot: ReturnType<typeof requireReviewedAvalancheUi>,
): Record<string, Fee[]> =>
  Object.fromEntries(
    snapshot.review.feeOutputs.map((output) => [
      output.tokenId,
      output.fees.map((fee) => ({
        heights: { ...fee.heights },
        configs: Object.fromEntries(
          Object.entries(fee.configs).map(([chain, values]) => [
            chain,
            {
              bridgeFee: BigInt(values.bridgeFee),
              networkFee: BigInt(values.networkFee),
              rsnRatio: BigInt(values.rsnRatio),
              rsnRatioDivisor: BigInt(values.rsnRatioDivisor),
              feeRatio: BigInt(values.feeRatio),
            },
          ]),
        ),
      })),
    ]),
  );

/** Projects display data and exact comparison results from the same admitted record. */
export const projectAvalancheFeeUi = (
  snapshot: ReturnType<typeof requireReviewedAvalancheUi>,
) => {
  const { publication, review, economics } = snapshot;
  const prices: Record<string, string> = Object.fromEntries(
    publication.legacyNumericPrices.map(([id, value]) => [id, String(value)]),
  );
  Object.assign(prices, publication.avalancheDecimalPrices.tokens);
  const validationResults: Record<string, ValidationResultOk> = {};
  const rows = review.feeOutputs.map((output) => {
    const token = publication.supportedTokens.find(
      (candidate) => candidate.ergoSideTokenId === output.tokenId,
    );
    if (!token || !prices[token.tokenId])
      throw new Error('Avalanche display data is unavailable');
    const update = economics.checkedUpdates.find(
      (candidate) => candidate.ergoTokenId === output.tokenId,
    );
    validationResults[output.tokenId] = update
      ? {
          isValid: true,
          reason: `Avalanche fee ${update.fee.networkFee}; activation height ${update.activationHeight}. Compared against the configured economic reference for this publication.`,
        }
      : {
          isValid: false,
          reason:
            'This token has structural review only; no Avalanche economic comparison.',
        };
    return {
      tokenId: token.tokenId,
      ergoSideTokenId: output.tokenId,
      name: token.name,
      price: prices[token.tokenId],
    };
  });
  return {
    publicationId: publication.publicationId,
    transactionId: economics.transactionId,
    tx: JSON.stringify(publication.transaction),
    rows,
    prices,
    feesByToken: avalancheUiFeesByToken(snapshot),
    validationResults,
  };
};

export type AvalancheFeeUiSnapshot = ReturnType<typeof projectAvalancheFeeUi>;
