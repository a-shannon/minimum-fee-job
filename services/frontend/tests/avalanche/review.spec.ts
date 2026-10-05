import { decodeAvalanchePublication } from '../../src/avalanche/publication';
import {
  captureReviewContract,
  inspectPublicationReview,
} from '../../src/avalanche/review';
import {
  reviewCases0,
  reviewCases2,
  reviewCases3,
  reviewCases5,
} from '../testData/avalanchePublicationReview';
import { body, seal } from '../testUtils/avalanchePublicationFixture';
import { economicsFixture } from './economicsFixture';
import { setupStructure } from './structureFixture';

/** Supplies the integrity-verified minimum-fee codec for the real structural review fixtures. */
vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});

describe('inspectPublicationReview', () => {
  /**
   * @target inspectPublicationReview: reviews canonical V1 and V2 transactions on chain %s
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Build canonical V1 and V2 real WASM publications on both explicit chains and review each configured contract.
   * @expected Both are reviewed with their publication and transaction identities, original output index and structure-only scope; no signing flag appears.
   */
  it.each(reviewCases0)(
    'reviews canonical V1 and V2 transactions on chain %s',
    (chainId) => {
      const f = setupStructure(),
        built = f.build();
      const v1 = seal({ ...built.body, chainId });
      const v2 = economicsFixture({ chainId }).packet;
      const config = captureReviewContract(
        chainId,
        f.address,
        f.contract.minimumFeeNFT,
      );
      for (const packet of [v1, v2]) {
        const publication = decodeAvalanchePublication(packet, chainId);
        const result = inspectPublicationReview(publication, config);
        expect(result.status).toEqual('reviewed');
        if (result.status !== 'reviewed') throw Error('review');
        expect(result.report.publicationId).toEqual(publication.publicationId);
        expect(result.report.transactionId).toMatch(/^[0-9a-f]{64}$/);
        expect(result.report.scope).toEqual('transaction-structure-only');
        expect(result.report.feeOutputs[0].index).toEqual(1);
        expect(result).not.toHaveProperty('eligibleForSigning');
      }
    },
  );

  /**
   * @target inspectPublicationReview: binds computed transaction identity, original indices and exact Long fields
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Review the canonical real WASM transaction and inspect its original input index and fee fields.
   * @expected The computed WASM transaction and box IDs match exactly, large Long text is retained and the report is frozen.
   */
  it('binds computed transaction identity, original indices and exact Long fields', () => {
    const f = setupStructure(),
      built = f.build();
    const result = inspectPublicationReview(
      decodeAvalanchePublication(built.publication, 43113),
      captureReviewContract(43113, f.address, f.contract.minimumFeeNFT),
    );
    if (result.status !== 'reviewed') throw Error('review');
    expect(result.report.transactionId).toEqual(built.unsigned.id().to_str());
    expect(result.report.feeInputs[0].boxId).toEqual(f.old.box_id().to_str());
    expect(result.report.feeInputs[0].index).toEqual(1);
    expect(result.report.feeOutputs[0].fees[0].configs.avalanche).toEqual({
      bridgeFee: '1',
      networkFee: '9007199254740993',
      rsnRatio: '2',
      rsnRatioDivisor: '1000',
      feeRatio: '3',
    });
    expect(Object.isFrozen(result.report)).toEqual(true);
  });
  /**
   * @target inspectPublicationReview: a valid but wrong configured %s cannot approve the transaction
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Keep a syntactically valid configuration but change its address, NFT or explicit chain.
   * @expected Structural review returns a rejected result bound to the original publication.
   */
  it.each(reviewCases5)(
    'a valid but wrong configured %s cannot approve the transaction',
    (fault) => {
      const f = setupStructure(),
        p = decodeAvalanchePublication(f.build().publication, 43113);
      const config = captureReviewContract(
        fault === 'chain' ? 43114 : 43113,
        fault === 'address' ? f.fundingAddress : f.address,
        fault === 'NFT' ? 'ff'.repeat(32) : f.contract.minimumFeeNFT,
      );
      expect(config.status).toEqual('configured');
      expect(inspectPublicationReview(p, config)).toEqual({
        status: 'rejected',
        publicationId: p.publicationId,
      });
    },
  );

  /**
   * @target inspectPublicationReview: malformed canonical-envelope transaction does not produce a structural report
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Replace the reduced transaction transport with AQID and recompute the publication digest.
   * @expected A schema-valid envelope containing malformed WASM cannot produce a structural report.
   */
  it('malformed canonical-envelope transaction does not produce a structural report', () => {
    const f = setupStructure(),
      built = f.build();
    const p = decodeAvalanchePublication(
      seal({
        ...built.body,
        transaction: {
          ...(built.body.transaction as object),
          reducedTx: 'AQID',
        },
      }),
      43113,
    );
    expect(
      inspectPublicationReview(
        p,
        captureReviewContract(43113, f.address, f.contract.minimumFeeNFT),
      ).status,
    ).toEqual('rejected');
  });

  /**
   * @target inspectPublicationReview: an empty publication reports no transaction rather than no-update authority
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Review the independently sealed empty envelope against the configured contract.
   * @expected The report is empty with null transaction ID and empty fee-input/output collections, without no-update authority.
   */
  it('an empty publication reports no transaction rather than no-update authority', () => {
    const f = setupStructure();
    const result = inspectPublicationReview(
      decodeAvalanchePublication(seal(body()), 43113),
      captureReviewContract(43113, f.address, f.contract.minimumFeeNFT),
    );
    expect(result).toMatchObject({
      status: 'reviewed',
      report: {
        kind: 'empty',
        transactionId: null,
        feeInputs: [],
        feeOutputs: [],
      },
    });
  });
});

describe('captureReviewContract', () => {
  /**
   * @target captureReviewContract: missing or invalid contract address %j is unavailable
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Supply each missing, empty, malformed or whitespace-padded contract address.
   * @expected Independent contract capture is unavailable for every invalid address.
   */
  it.each(reviewCases2)(
    'missing or invalid contract address %j is unavailable',
    (address) => {
      expect(
        captureReviewContract(43113, address, '12'.repeat(32)).status,
      ).toEqual('unavailable');
    },
  );

  /**
   * @target captureReviewContract: missing or invalid NFT %j is unavailable
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Supply each missing, empty, zero, uppercase or short NFT identifier.
   * @expected Independent contract capture is unavailable for every invalid NFT.
   */
  it.each(reviewCases3)('missing or invalid NFT %j is unavailable', (nft) => {
    const f = setupStructure();
    expect(captureReviewContract(43113, f.address, nft).status).toEqual(
      'unavailable',
    );
  });

  /**
   * @target captureReviewContract: captures and freezes the independent deployment identity
   * @dependencies Pinned real WASM/minimum-fee producer fixtures and independent deployment configuration; no network or signing.
   * @scenario Capture the independently configured address and NFT for 43113.
   * @expected The configuration and its nested contract are configured and frozen.
   */
  it('captures and freezes the independent deployment identity', () => {
    const f = setupStructure();
    const config = captureReviewContract(
      43113,
      f.address,
      f.contract.minimumFeeNFT,
    );
    expect(config.status).toEqual('configured');
    expect(Object.isFrozen(config)).toEqual(true);
    if (config.status === 'configured')
      expect(Object.isFrozen(config.contract)).toEqual(true);
  });
});
