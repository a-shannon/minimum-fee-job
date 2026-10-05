import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { captureEconomicAuthority } from '../../src/avalanche/economicAuthority';
import { inspectEconomicReview } from '../../src/avalanche/economicReview';
import { inspectAvalancheFeeEconomics } from '../../src/avalanche/economics';
import { decodeAvalanchePublication } from '../../src/avalanche/publication';
import {
  captureReviewContract,
  inspectPublicationReview,
} from '../../src/avalanche/review';
import {
  economicReviewCases0,
  economicReviewCases1,
  economicReviewCases2,
  economicReviewCases3,
  economicReviewCases4,
  economicReviewCases5,
  economicReviewCases6,
  economicReviewCases7,
} from '../testData/economicReview';
import { seal } from '../testUtils/avalanchePublicationFixture';
import { clone } from '../testUtils/economicReview';
import { economicsFixture } from './economicsFixture';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('inspectEconomicReview', () => {
  let directory: string;
  beforeEach(() => {
    const root = process.env.AVALANCHE_AUTHORITY_ARTIFACT_ROOT;
    if (!root) throw Error('Required external authority artifact root');
    mkdirSync(root, { recursive: true });
    directory = mkdtempSync(join(root, 'review-'));
  });
  /** Builds authentic WASM and matching structural review, then retains a separately captured snapshot in the current hook-owned directory. */
  const setup = (chainId: 43113 | 43114 = 43113, existing = false) => {
    const f = economicsFixture({ chainId, existing });
    const publication = decodeAvalanchePublication(f.packet, chainId);
    const structural = inspectPublicationReview(
      publication,
      captureReviewContract(
        chainId,
        f.policy.contract.minimumFeeAddress,
        f.policy.contract.minimumFeeNFT,
      ),
    );
    const snapshot = {
      schemaVersion: 1,
      chainId,
      publicationId: publication.publicationId,
      policy: clone(f.policy),
      observations: clone(f.observations),
    };
    /** Writes the supplied snapshot and captures it by exact SHA-256 for the fixture chain. */
    const capture = (value: unknown = snapshot) => {
      const bytes = JSON.stringify(value),
        path = join(directory, 'snapshot.json');
      writeFileSync(path, bytes);
      return captureEconomicAuthority(
        chainId,
        path,
        createHash('sha256').update(bytes).digest('hex'),
      );
    };
    return { f, publication, structural, snapshot, capture };
  };
  /**
   * @target inspectEconomicReview — compares actual V2 WASM on chain %s against a separately captured snapshot
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Construct authentic V2 WASM for each explicit chain and both new/existing fee-box histories, then capture a separate local economic snapshot.
   * @expected The result is compared with matching publication and transaction IDs, frozen update-only scope, no signing eligibility and a fresh authority.
   */
  it.each(economicReviewCases0)(
    'compares actual V2 WASM on chain %s against a separately captured snapshot',
    (chainId) => {
      for (const existing of [false, true]) {
        const f = setup(chainId, existing),
          authority = f.capture();
        const result = inspectEconomicReview(
          f.publication,
          f.structural,
          authority,
        );
        expect(result.status).toEqual('compared');
        if (result.status !== 'compared' || f.structural.status !== 'reviewed')
          throw Error('review');
        expect(result.report.publicationId).toEqual(
          f.publication.publicationId,
        );
        expect(result.report.transactionId).toEqual(
          f.structural.report.transactionId,
        );
        expect(result.report.scope).toEqual('published-avalanche-updates-only');
        expect(Object.isFrozen(result)).toEqual(true);
        expect(result).not.toHaveProperty('eligibleForSigning');
        expect(() => authority.assertFresh()).not.toThrow();
      }
    },
  );
  /**
   * @target inspectEconomicReview — structure passes while independent snapshot %s disagreement is rejected
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Keep structural review successful while changing only the independently captured price, common policy, prior bytes, fee quote or frontier.
   * @expected Authority capture remains available, but economic review rejects the isolated disagreement.
   */
  it.each(economicReviewCases1)(
    'structure passes while independent snapshot %s disagreement is rejected',
    (fault) => {
      const f = setup();
      if (fault === 'price') f.snapshot.observations.prices.avax = '3';
      if (fault === 'common') f.snapshot.policy.common.avax.bridgeFee = '2';
      if (fault === 'prior')
        Object.assign(f.snapshot.observations.priorFeeBoxes, {
          [Object.keys(f.snapshot.observations.priorFeeBoxes)[0]]: Buffer.from(
            f.f.prior.sigma_serialize_bytes(),
          ).toString('base64'),
        });
      if (fault === 'quote') {
        f.snapshot.observations.quote.baseFeePerGas = '2';
        f.snapshot.observations.quote.maxFeePerGas = '5';
      }
      if (fault === 'frontier') {
        f.snapshot.observations.finalized.height = 101;
        f.snapshot.observations.frontiers.avalanche = 101;
      }
      expect(f.structural.status).toEqual('reviewed');
      const authority = f.capture();
      expect(authority.status).toEqual('available');
      expect(
        inspectEconomicReview(f.publication, f.structural, authority).status,
      ).toEqual('rejected');
    },
  );
  /**
   * @target inspectEconomicReview — rejects a resealed real WASM %s tamper after structure succeeds
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Rebuild and reseal real WASM with a changed network fee or paired common fee, retaining successful structural review.
   * @expected The direct economics inspector throws its precise history/candidate error and the review returns rejected.
   */
  it.each(economicReviewCases2)(
    'rejects a resealed real WASM %s tamper after structure succeeds',
    (fault) => {
      const f = setup();
      const candidate = clone(f.f.candidate);
      if (fault === 'network fee')
        candidate.configs.avalanche.networkFee = '3000000001';
      else
        for (const config of Object.values(candidate.configs))
          config.bridgeFee = '2';
      const built = f.f.f.build(
        [f.f.f.normal, f.f.candidateBox([candidate])],
        [f.f.f.funding],
      );
      const value = clone(f.f.body);
      value.transaction = built.body.transaction;
      if (fault === 'paired common')
        value.feeEvidence.updates[0].candidate = candidate;
      const publication = decodeAvalanchePublication(seal(value), 43113);
      const structural = inspectPublicationReview(
        publication,
        captureReviewContract(
          43113,
          f.f.f.address,
          f.f.f.contract.minimumFeeNFT,
        ),
      );
      expect(structural.status).toEqual('reviewed');
      f.snapshot.publicationId = publication.publicationId;
      expect(() =>
        inspectAvalancheFeeEconomics(
          publication,
          f.snapshot.policy,
          f.snapshot.observations,
        ),
      ).toThrow(
        fault === 'network fee'
          ? 'retained history'
          : 'candidate Avalanche fee',
      );
      expect(
        inspectEconomicReview(publication, structural, f.capture()).status,
      ).toEqual('rejected');
    },
  );
  /**
   * @target inspectEconomicReview — rejects independently captured snapshot %s mismatch
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Change only the captured publication ID, chain, contract address or NFT.
   * @expected The independently captured identity mismatch is rejected.
   */
  it.each(economicReviewCases3)(
    'rejects independently captured snapshot %s mismatch',
    (fault) => {
      const f = setup();
      if (fault === 'publicationId') f.snapshot.publicationId = 'ff'.repeat(32);
      if (fault === 'chain') f.snapshot.policy.contract.expectedChainId = 43114;
      if (fault === 'address')
        f.snapshot.policy.contract.minimumFeeAddress = f.f.f.fundingAddress;
      if (fault === 'nft')
        f.snapshot.policy.contract.minimumFeeNFT = 'ff'.repeat(32);
      expect(
        inspectEconomicReview(f.publication, f.structural, f.capture()).status,
      ).toEqual('rejected');
    },
  );
  /**
   * @target inspectEconomicReview — rejects structural report %s mismatch
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Keep the publication and authority fixed but change one structural publication ID, chain, transaction ID or scope.
   * @expected Economic review rejects every structural binding mismatch.
   */
  it.each(economicReviewCases4)(
    'rejects structural report %s mismatch',
    (fault) => {
      const f = setup();
      if (f.structural.status !== 'reviewed') throw Error('structural');
      const report = clone(f.structural.report);
      if (fault === 'publicationId') report.publicationId = 'ff'.repeat(32);
      if (fault === 'chain') report.contract.expectedChainId = 43114;
      if (fault === 'transactionId') report.transactionId = 'ff'.repeat(32);
      if (fault === 'scope') Object.assign(report, { scope: 'other' });
      expect(
        inspectEconomicReview(
          f.publication,
          { status: 'reviewed', report },
          f.capture(),
        ).status,
      ).toEqual('rejected');
    },
  );
  /**
   * @target inspectEconomicReview — does not infer authority from publication for %s
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Use absent authority configuration or malformed local snapshot configuration beside an otherwise valid publication.
   * @expected Review returns unavailable with the same explicit not-configured or invalid-snapshot reason.
   */
  it.each(economicReviewCases5)(
    'does not infer authority from publication for %s',
    (reason) => {
      const f = setup();
      const authority =
        reason === 'not-configured'
          ? captureEconomicAuthority(43113, undefined, undefined)
          : captureEconomicAuthority(43113, 'relative', 'bad');
      expect(
        inspectEconomicReview(f.publication, f.structural, authority),
      ).toEqual({ status: 'unavailable', reason });
    },
  );
  /**
   * @target inspectEconomicReview — does not treat %s as economic evidence
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Reseal the fixture as V1 or an empty V2 publication while retaining the captured authority and structural result.
   * @expected Review returns unavailable/unsupported-publication.
   */
  it.each(economicReviewCases6)(
    'does not treat %s as economic evidence',
    (kind) => {
      const f = setup(),
        value = structuredClone(f.f.body) as Record<string, unknown>;
      if (kind === 'V1') {
        value.version = 1;
        delete value.feeEvidence;
      } else {
        value.kind = 'empty';
        value.transaction = null;
        value.feeEvidence = { ...f.f.body.feeEvidence, updates: [] };
      }
      const publication = decodeAvalanchePublication(seal(value), 43113);
      expect(
        inspectEconomicReview(publication, f.structural, f.capture()),
      ).toEqual({ status: 'unavailable', reason: 'unsupported-publication' });
    },
  );
  /**
   * @target inspectEconomicReview — requires successful structure when %s
   * @dependencies Real authority capture and structural/economic inspectors, authentic pinned minimum-fee codec and WASM fixtures; the module mock redirects minimum-fee to the producer fixture.
   * @scenario Pass an unavailable or rejected structural result beside an authentic economic publication and captured authority.
   * @expected Review returns unavailable/structure-unavailable.
   */
  it.each(economicReviewCases7)(
    'requires successful structure when %s',
    (status) => {
      const f = setup();
      const review =
        status === 'unavailable'
          ? { status, reason: 'missing-contract' as const }
          : { status, publicationId: f.publication.publicationId };
      expect(inspectEconomicReview(f.publication, review, f.capture())).toEqual(
        {
          status: 'unavailable',
          reason: 'structure-unavailable',
        },
      );
    },
  );
});
