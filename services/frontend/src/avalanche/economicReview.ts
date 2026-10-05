// Server-only comparison against a separately configured, captured snapshot.
import type { CapturedEconomicAuthority } from './economicAuthority';
import {
  AvalancheFeeEconomicsReport,
  inspectAvalancheFeeEconomics,
} from './economics';
import type { AvalanchePublication } from './publication';
import type { AvalancheStructuralReview } from './review';

export type EconomicReview =
  | Readonly<{
      status: 'unavailable';
      reason:
        | 'not-configured'
        | 'invalid-snapshot'
        | 'unsupported-publication'
        | 'structure-unavailable';
    }>
  | Readonly<{
      status: 'rejected';
      publicationId: string;
      authoritySha256: string;
    }>
  | Readonly<{
      status: 'compared';
      authoritySha256: string;
      report: AvalancheFeeEconomicsReport;
    }>;

/** Compares a structurally reviewed publication with the independently captured economic authority. */
export const inspectEconomicReview = (
  publication: AvalanchePublication,
  structuralReview: AvalancheStructuralReview,
  authority: CapturedEconomicAuthority,
): EconomicReview => {
  if (authority.status === 'unavailable')
    return Object.freeze({ status: 'unavailable', reason: authority.reason });
  if (publication.version !== 2 || publication.kind !== 'transaction')
    return Object.freeze({
      status: 'unavailable',
      reason: 'unsupported-publication',
    });
  if (
    structuralReview.status !== 'reviewed' ||
    structuralReview.report.kind !== 'transaction'
  )
    return Object.freeze({
      status: 'unavailable',
      reason: 'structure-unavailable',
    });
  try {
    const structure = structuralReview.report;
    const snapshot = authority.snapshot;
    const contract = snapshot.policy.contract;
    if (
      snapshot.publicationId !== publication.publicationId ||
      snapshot.chainId !== publication.chainId ||
      structure.publicationId !== publication.publicationId ||
      structure.contract.expectedChainId !== publication.chainId ||
      structure.scope !== 'transaction-structure-only' ||
      typeof structure.transactionId !== 'string' ||
      !/^[0-9a-f]{64}$/.test(structure.transactionId) ||
      !contract ||
      Object.keys(contract).sort().join(',') !==
        'expectedChainId,minimumFeeAddress,minimumFeeNFT' ||
      contract.expectedChainId !== structure.contract.expectedChainId ||
      contract.minimumFeeAddress !== structure.contract.minimumFeeAddress ||
      contract.minimumFeeNFT !== structure.contract.minimumFeeNFT
    )
      throw new Error('Economic review binding');
    const report = inspectAvalancheFeeEconomics(
      publication,
      snapshot.policy,
      snapshot.observations,
    );
    if (
      report.publicationId !== publication.publicationId ||
      report.transactionId !== structure.transactionId
    )
      throw new Error('Economic review result binding');
    return Object.freeze({
      status: 'compared',
      authoritySha256: authority.authoritySha256,
      report,
    });
  } catch {
    return Object.freeze({
      status: 'rejected',
      publicationId: publication.publicationId,
      authoritySha256: authority.authoritySha256,
    });
  }
};
