import { createHash } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';

import { loadAvalanchePublication } from '../../src/store/avalanchePublication';
import { loadAvalancheFeeUi } from '../../src/store/avalanchePublication';
import { economicsFixture } from '../avalanche/economicsFixture';
import { setupStructure } from '../avalanche/structureFixture';
import { native } from '../testData/avalanchePublicationFixture';
import {
  versions,
  contractFaults,
  ownerChanges,
  invalidConfiguration,
  chainIds,
  referenceFaults,
  referenceRaces,
} from '../testData/avalancheStore';
import { fixture } from '../testUtils/avalanchePublicationFixture';
import {
  economicStoreFixture,
  storedRecordCases,
} from '../testUtils/avalancheStore';
import { serve, setupExistingFeeUi } from '../testUtils/existingFeeUiStore';

describe('loadAvalanchePublication', () => {
  vi.mock('@rosen-bridge/minimum-fee', async () => {
    const { pinnedFeeDependencies } = await import(
      '../../../backend/tests/fixtures/pinnedFeeDependencies'
    );
    return pinnedFeeDependencies().fees;
  });

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_CHAIN_ID', '43113');
    vi.stubEnv('KV_REST_API_URL', 'https://synthetic-kv.invalid');
    vi.stubEnv('KV_REST_API_TOKEN', 'synthetic-token');
    vi.stubEnv('MINIMUM_FEE_CONFIG_ADDRESS', undefined);
    vi.stubEnv('MINIMUM_FEE_CONFIG_NFT', undefined);
    vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_FILE', undefined);
    vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256', undefined);
  });
  /**
   * @target loadAvalanchePublication: same single SDK GET binds a V%s real transaction and structural report
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Build the selected publication version; serve it through the pinned KV SDK; check one GET, the structural identity and the request body.
   * @expected same single SDK GET binds a Vthe selected case real transaction and structural report.
   */
  it.each(versions)(
    'same single SDK GET binds a V%s real transaction and structural report',
    async (version) => {
      const f = setupStructure(),
        built = f.build();
      const packet =
        version === 1 ? built.publication : economicsFixture().packet;
      vi.stubEnv('MINIMUM_FEE_CONFIG_ADDRESS', f.address);
      vi.stubEnv('MINIMUM_FEE_CONFIG_NFT', f.contract.minimumFeeNFT);
      const fetch = vi.fn(
        async () =>
          new Response(JSON.stringify([{ result: JSON.stringify(packet) }])),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await loadAvalanchePublication();
      expect(fetch).toHaveBeenCalledOnce();
      expect(result.review?.status).toEqual('reviewed');
      if (result.review?.status !== 'reviewed') throw Error('review');
      expect(result.review.report.publicationId).toEqual(
        result.publication?.publicationId,
      );
      expect(result.review.report.feeOutputs[0].index).toEqual(1);
      const options = fetch.mock.calls[0] as unknown as [
        string,
        { body: string },
      ];
      expect(JSON.parse(options[1].body)).toEqual([
        ['get', 'avalanche-fee-publication-v1'],
      ]);
    },
  );
  /**
   * @target loadAvalanchePublication: metadata stays available with %s contract and no structural approval
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Remove or alter the contract configuration; load the real publication; check metadata and the unavailable or rejected structural result.
   * @expected metadata stays available with the selected case contract and no structural approval.
   */
  it.each(contractFaults)(
    'metadata stays available with %s contract and no structural approval',
    async (fault) => {
      const f = setupStructure(),
        packet = f.build().publication;
      if (fault !== 'missing') {
        vi.stubEnv(
          'MINIMUM_FEE_CONFIG_ADDRESS',
          fault === 'invalid' ? 'bad' : f.fundingAddress,
        );
        vi.stubEnv('MINIMUM_FEE_CONFIG_NFT', f.contract.minimumFeeNFT);
      }
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify([{ result: JSON.stringify(packet) }])),
        ),
      );
      const result = await loadAvalanchePublication();
      expect(result.publication?.publicationId).toEqual(packet.publicationId);
      expect(result.review?.status).toEqual(
        fault === 'wrong' ? 'rejected' : 'unavailable',
      );
    },
  );
  /**
   * @target loadAvalanchePublication: drops the entire response if owner %s changes during GET
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Start a pending GET with an economic reference; change one owner field; release the response and check that it is discarded.
   * @expected drops the entire response if owner the selected case changes during GET.
   */
  it.each(ownerChanges)(
    'drops the entire response if owner %s changes during GET',
    async (key, value) => {
      const authorityFixture = economicStoreFixture();
      let resolve!: (value: Response) => void;
      const pending = new Promise<Response>((done) => {
        resolve = done;
      });
      const fetch = vi.fn(() => pending);
      vi.stubGlobal('fetch', fetch);
      const result = loadAvalanchePublication();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      vi.stubEnv(key, value);
      resolve(
        new Response(
          JSON.stringify([{ result: JSON.stringify(authorityFixture.packet) }]),
        ),
      );
      expect(await result).toEqual({
        error: 'Avalanche publication is unavailable',
      });
    },
  );
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  /**
   * @target loadAvalanchePublication: actual pinned KV SDK emits one GET for the entire envelope
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Serve an empty envelope through the pinned SDK; load it and inspect the single pipeline GET and decoded kind.
   * @expected actual pinned KV SDK emits one GET for the entire envelope.
   */
  it('actual pinned KV SDK emits one GET for the entire envelope', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ result: JSON.stringify(fixture()) }])),
    );
    vi.stubGlobal('fetch', fetch);
    expect((await loadAvalanchePublication()).publication?.kind).toEqual(
      'empty',
    );
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toEqual('https://synthetic-kv.invalid/pipeline');
    expect(JSON.parse(options.body)).toEqual([
      ['get', 'avalanche-fee-publication-v1'],
    ]);
  });
  /**
   * @target loadAvalanchePublication: fails closed before GET for %s=%s
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Set one invalid opt-in or KV field; attempt to load; check the sanitized error and absence of a request.
   * @expected fails closed before GET for the selected case=the selected case.
   */
  it.each(invalidConfiguration)(
    'fails closed before GET for %s=%s',
    async (key, value) => {
      vi.stubEnv(key, value);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect(await loadAvalanchePublication()).toEqual({
        error: 'Avalanche publication is unavailable',
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  /**
   * @target loadAvalanchePublication: rejects missing or invalid stored record %j
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Serve each missing, malformed or wrong-chain stored record; load it and check the sanitized error.
   * @expected rejects missing or invalid stored record the selected record.
   */
  it.each(storedRecordCases())(
    'rejects missing or invalid stored record %j',
    async (result) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify([{ result }]))),
      );
      expect(await loadAvalanchePublication()).toEqual({
        error: 'Avalanche publication is unavailable',
      });
    },
  );
  /**
   * @target loadAvalanchePublication: sanitizes SDK errors and never returns stale data
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Return an SDK error containing sensitive text; load it and check that only the sanitized error is returned.
   * @expected sanitizes SDK errors and never returns stale data.
   */
  it('sanitizes SDK errors and never returns stale data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { error: 'https://secret.invalid credential=secret' },
            ]),
          ),
      ),
    );
    expect(await loadAvalanchePublication()).toEqual({
      error: 'Avalanche publication is unavailable',
    });
  });

  /**
   * @target loadAvalanchePublication: one GET on chain %s joins the actual transaction to the configured economic snapshot
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Create the selected-chain economic reference and real transaction; serve one GET; check bound identities, scope and absence of signing authority.
   * @expected one GET on chain the selected case joins the actual transaction to the configured economic snapshot.
   */
  it.each(chainIds)(
    'one GET on chain %s joins the actual transaction to the configured economic snapshot',
    async (chainId) => {
      const fixture = economicStoreFixture(chainId);
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify([{ result: JSON.stringify(fixture.packet) }]),
          ),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await loadAvalanchePublication();
      expect(fetch).toHaveBeenCalledOnce();
      expect(result.review?.status).toEqual('reviewed');
      expect(result.economicReview?.status).toEqual('compared');
      if (
        result.review?.status !== 'reviewed' ||
        result.economicReview?.status !== 'compared'
      )
        throw new Error('Expected bound comparison');
      expect(result.economicReview.authoritySha256).toEqual(fixture.sha256);
      expect(result.economicReview.report.publicationId).toEqual(
        fixture.packet.publicationId,
      );
      expect(result.economicReview.report.transactionId).toEqual(
        result.review.report.transactionId,
      );
      expect(result.economicReview.report.scope).toEqual(
        'published-avalanche-updates-only',
      );
      expect(result).not.toHaveProperty('eligibleForSigning');
      expect(result).not.toHaveProperty('authority');
      expect(JSON.stringify(result)).not.toContain(fixture.path);
    },
  );
  /**
   * @target loadAvalanchePublication: %s economic reference preserves metadata without positive comparison
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Remove or corrupt one reference field; load the real publication; check retained metadata and the unavailable or rejected comparison.
   * @expected the selected case economic reference preserves metadata without positive comparison.
   */
  it.each(referenceFaults)(
    '%s economic reference preserves metadata without positive comparison',
    async (fault) => {
      const fixture = economicStoreFixture();
      if (fault === 'missing') {
        vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_FILE', undefined);
        vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256', undefined);
      } else if (fault === 'bad hash') {
        vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256', 'ff'.repeat(32));
      } else {
        const reference = JSON.parse(fixture.bytes);
        if (fault === 'wrong publication')
          reference.publicationId = 'ff'.repeat(32);
        if (fault === 'divergent price')
          reference.observations.prices.avax = '3';
        const bytes = JSON.stringify(reference);
        writeFileSync(fixture.path, bytes);
        vi.stubEnv(
          'AVALANCHE_FEE_REVIEW_AUTHORITY_SHA256',
          createHash('sha256').update(bytes).digest('hex'),
        );
      }
      const fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify([{ result: JSON.stringify(fixture.packet) }]),
          ),
      );
      vi.stubGlobal('fetch', fetch);
      const result = await loadAvalanchePublication();
      expect(fetch).toHaveBeenCalledOnce();
      expect(result.publication?.publicationId).toEqual(
        fixture.packet.publicationId,
      );
      expect(result.review?.status).toEqual('reviewed');
      expect(result.economicReview?.status).toEqual(
        fault === 'missing' || fault === 'bad hash'
          ? 'unavailable'
          : 'rejected',
      );
      expect(JSON.stringify(result)).not.toContain(fixture.path);
    },
  );
  /**
   * @target loadAvalanchePublication: %s during GET discards the response from an available economic reference
   * @dependencies Pinned KV SDK, actual decoder, structural review and economic reference fixtures.
   * @scenario Start a GET against a valid reference; replace its bytes or remove it; release the response and check that it is discarded.
   * @expected the selected case during GET discards the response from an available economic reference.
   */
  it.each(referenceRaces)(
    '%s during GET discards the response from an available economic reference',
    async (fault) => {
      const fixture = economicStoreFixture();
      let resolve!: (response: Response) => void;
      const pending = new Promise<Response>((done) => {
        resolve = done;
      });
      const fetch = vi.fn(() => pending);
      vi.stubGlobal('fetch', fetch);
      const result = loadAvalanchePublication();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      if (fault === 'replace bytes')
        writeFileSync(fixture.path, fixture.bytes + ' ');
      else unlinkSync(fixture.path);
      resolve(
        new Response(
          JSON.stringify([{ result: JSON.stringify(fixture.packet) }]),
        ),
      );
      expect(await result).toEqual({
        error: 'Avalanche publication is unavailable',
      });
    },
  );
});

describe('loadAvalancheFeeUi', () => {
  setupExistingFeeUi();
  /**
   * @target loadAvalancheFeeUi: projects all table and QR data from one publication
   * @dependencies Real WASM transaction and complete atomic economic review.
   * @scenario Load one snapshot; compare its identity, exact table price, fee fields and QR bytes.
   * @expected All consumer data is bound to the same reviewed publication.
   */
  it('projects all table and QR data from one publication', async () => {
    const f = serve();
    const snapshot = await loadAvalancheFeeUi();
    expect(snapshot.publicationId).toEqual(f.packet.publicationId);
    expect(snapshot.tx).toEqual(JSON.stringify(f.packet.transaction));
    expect(snapshot.rows).toEqual([
      { tokenId: 'avax', ergoSideTokenId: native, name: 'AVAX', price: '2' },
    ]);
    expect(
      snapshot.feesByToken[native][0].configs.avalanche.networkFee,
    ).toEqual(3000000000n);
    expect(snapshot.validationResults[native]).toMatchObject({
      isValid: true,
    });
    expect(f.fetch).toHaveBeenCalledOnce();
  });
});
