// Server-only review; deployment identity comes from independent server config.
import { Address } from 'ergo-lib-wasm-nodejs';

import type { AvalancheChainId, AvalanchePublication } from './publication';
import type { AvalancheFeeContract } from './transaction';
import {
  AvalancheFeeStructuralReport,
  inspectAvalancheFeeStructure,
} from './validation';

export type ReviewContract =
  | Readonly<{ status: 'configured'; contract: Readonly<AvalancheFeeContract> }>
  | Readonly<{
      status: 'unavailable';
      reason: 'missing-contract' | 'invalid-contract';
    }>;

export type AvalancheStructuralReview =
  | Readonly<{
      status: 'unavailable';
      reason: 'missing-contract' | 'invalid-contract';
    }>
  | Readonly<{ status: 'rejected'; publicationId: string }>
  | Readonly<{ status: 'reviewed'; report: AvalancheFeeStructuralReport }>;

/** Capture operator configuration before any store/network await. */
export const captureReviewContract = (
  expectedChainId: AvalancheChainId,
  minimumFeeAddress: unknown,
  minimumFeeNFT: unknown,
): ReviewContract => {
  if (minimumFeeAddress === undefined || minimumFeeNFT === undefined)
    return Object.freeze({ status: 'unavailable', reason: 'missing-contract' });
  try {
    if (
      ![43113, 43114].includes(expectedChainId) ||
      typeof minimumFeeAddress !== 'string' ||
      minimumFeeAddress.length === 0 ||
      minimumFeeAddress.length > 4096 ||
      minimumFeeAddress.trim() !== minimumFeeAddress ||
      typeof minimumFeeNFT !== 'string' ||
      !/^[0-9a-f]{64}$/.test(minimumFeeNFT) ||
      /^0+$/.test(minimumFeeNFT)
    )
      throw new Error('Invalid contract');
    const address = Address.from_base58(minimumFeeAddress);
    address.free();
    return Object.freeze({
      status: 'configured',
      contract: Object.freeze({
        expectedChainId,
        minimumFeeAddress,
        minimumFeeNFT,
      }),
    });
  } catch {
    return Object.freeze({ status: 'unavailable', reason: 'invalid-contract' });
  }
};

/** Reviews transaction structure against the independently configured contract and binds the result to the publication. */
export const inspectPublicationReview = (
  publication: AvalanchePublication,
  configuration: ReviewContract,
): AvalancheStructuralReview => {
  if (configuration.status === 'unavailable') return configuration;
  try {
    const report = inspectAvalancheFeeStructure(
      publication,
      configuration.contract,
    );
    if (
      report.publicationId !== publication.publicationId ||
      report.kind !== publication.kind
    )
      throw new Error('Review binding');
    return Object.freeze({ status: 'reviewed', report });
  } catch {
    return Object.freeze({
      status: 'rejected',
      publicationId: publication.publicationId,
    });
  }
};
