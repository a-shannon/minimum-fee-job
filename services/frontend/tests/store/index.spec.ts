import { writeFileSync } from 'node:fs';

import { getTx } from '../../src/store';
import { getFeesByToken } from '../../src/utils/getFeesByToken';
import {
  literalFeeCases4,
  literalFeeCases10,
  literalFeeCases12,
} from '../testData/existingFeeUi';
import { seal } from '../testUtils/avalanchePublicationFixture';
import { serve, setupExistingFeeUi } from '../testUtils/existingFeeUiStore';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('getTx', () => {
  setupExistingFeeUi();
  /**
   * @target getTx: preserves actual reviewed V2 transaction bytes through one atomic GET
   * @dependencies Actual WASM transaction, pinned KV SDK and independent authority fixture.
   * @scenario Serve a V2 packet; get the existing QR string with its expected publication identity.
   * @expected The transaction is byte-identical and no legacy KV key is read.
   */
  it('preserves actual reviewed V2 transaction bytes through one atomic GET', async () => {
    const f = serve();
    expect(await getTx(f.packet.publicationId)).toEqual(
      JSON.stringify(f.packet.transaction),
    );
    expect(f.fetch).toHaveBeenCalledOnce();
    const options = f.fetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(options[1].body)).toEqual([
      ['get', 'avalanche-fee-publication-v1'],
    ]);
  });
  /**
   * @target getTx: refuses a publication changed since table validation
   * @dependencies Actual reviewed atomic record and caller publication identity.
   * @scenario Request QR data for another publication identity.
   * @expected The action rejects rather than exporting a different transaction.
   */
  it('refuses a publication changed since table validation', async () => {
    serve();
    await expect(getTx('00'.repeat(32))).rejects.toThrow('unavailable');
  });

  /** Runs the unchanged control body against one original case row. */
  const runLiteralFeeCase4 = async (
    fault: (typeof literalFeeCases4)[number],
  ) => {
    const f = serve();
    if (fault === 'missing-authority')
      vi.stubEnv('AVALANCHE_FEE_REVIEW_AUTHORITY_FILE', undefined);
    if (fault === 'missing-contract')
      vi.stubEnv('MINIMUM_FEE_CONFIG_NFT', undefined);
    if (fault === 'changed-authority') writeFileSync(f.path, f.bytes + ' ');
    if (['malformed', 'empty', 'wrong-chain'].includes(fault)) {
      const record =
        fault === 'malformed'
          ? {}
          : seal({
              ...f.body,
              ...(fault === 'empty'
                ? { kind: 'empty', transaction: null }
                : { chainId: 43113 }),
            });
      f.fetch.mockImplementation(
        async () =>
          new Response(JSON.stringify([{ result: JSON.stringify(record) }])),
      );
    }
    await expect(getTx()).rejects.toThrow('unavailable');
    await expect(getFeesByToken()).rejects.toThrow('unavailable');
    for (const call of f.fetch.mock.calls) {
      const options = call as unknown as [string, { body: string }];
      expect(JSON.parse(options[1].body)).toEqual([
        ['get', 'avalanche-fee-publication-v1'],
      ]);
    }
  };

  /**
   * @target getTx: refuses incomplete current atomic review for missing-authority
   * @dependencies Actual atomic SDK and authority/contract parser.
   * @scenario Remove one authority field or serve malformed data before the action.
   * @expected No legacy fallback or transaction string is returned.
   */
  it('refuses incomplete current atomic review for missing-authority', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase4(literalFeeCases4[0]);
  });

  /**
   * @target getTx: refuses incomplete current atomic review for missing-contract
   * @dependencies Actual atomic SDK and authority/contract parser.
   * @scenario Remove one authority field or serve malformed data before the action.
   * @expected No legacy fallback or transaction string is returned.
   */
  it('refuses incomplete current atomic review for missing-contract', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase4(literalFeeCases4[1]);
  });

  /**
   * @target getTx: refuses incomplete current atomic review for malformed
   * @dependencies Actual atomic SDK and authority/contract parser.
   * @scenario Remove one authority field or serve malformed data before the action.
   * @expected No legacy fallback or transaction string is returned.
   */
  it('refuses incomplete current atomic review for malformed', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase4(literalFeeCases4[2]);
  });

  /**
   * @target getTx: refuses incomplete current atomic review for empty
   * @dependencies Actual atomic SDK and authority/contract parser.
   * @scenario Remove one authority field or serve malformed data before the action.
   * @expected No legacy fallback or transaction string is returned.
   */
  it('refuses incomplete current atomic review for empty', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase4(literalFeeCases4[3]);
  });

  /**
   * @target getTx: refuses incomplete current atomic review for wrong-chain
   * @dependencies Actual atomic SDK and authority/contract parser.
   * @scenario Remove one authority field or serve malformed data before the action.
   * @expected No legacy fallback or transaction string is returned.
   */
  it('refuses incomplete current atomic review for wrong-chain', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase4(literalFeeCases4[4]);
  });

  /**
   * @target getTx: refuses incomplete current atomic review for changed-authority
   * @dependencies Actual atomic SDK and authority/contract parser.
   * @scenario Remove one authority field or serve malformed data before the action.
   * @expected No legacy fallback or transaction string is returned.
   */
  it('refuses incomplete current atomic review for changed-authority', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase4(literalFeeCases4[5]);
  });

  /** Runs the unchanged control body against one original case row. */
  const runLiteralFeeCase10 = async (
    enabled: (typeof literalFeeCases10)[number],
  ) => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', enabled);
    const legacy = { reducedTx: 'legacy', sender: 'legacy', inputs: [] };
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ result: JSON.stringify(legacy) }])),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await getTx()).toEqual(JSON.stringify(legacy));
    const options = fetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(options[1].body)).toEqual([['get', 'tx']]);
  };

  /**
   * @target getTx: preserves disabled legacy transaction read: undefined
   * @dependencies Actual pinned KV SDK with a synthetic legacy transaction.
   * @scenario Disable Avalanche; serve the legacy key and call existing getTx.
   * @expected Only the original tx key is requested and serialization is unchanged.
   */
  it('preserves disabled legacy transaction read: undefined', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase10(literalFeeCases10[0]);
  });

  /**
   * @target getTx: preserves disabled legacy transaction read: false
   * @dependencies Actual pinned KV SDK with a synthetic legacy transaction.
   * @scenario Disable Avalanche; serve the legacy key and call existing getTx.
   * @expected Only the original tx key is requested and serialization is unchanged.
   */
  it('preserves disabled legacy transaction read: false', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase10(literalFeeCases10[1]);
  });

  /** Runs the unchanged control body against one original case row. */
  const runLiteralFeeCase12 = async (
    enabled: (typeof literalFeeCases12)[number][0],
    chain: (typeof literalFeeCases12)[number][1],
  ) => {
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_FEE_PUBLICATION_ENABLED', enabled);
    vi.stubEnv('NEXT_PUBLIC_AVALANCHE_CHAIN_ID', chain);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(getTx()).rejects.toThrow('unavailable');
    expect(fetch).not.toHaveBeenCalled();
  };

  /**
   * @target getTx: refuses malformed opt-in: TRUE/43114
   * @dependencies Existing store entry point and feature configuration.
   * @scenario Set a malformed enabled value or unsupported enabled chain.
   * @expected Refusal occurs before any SDK request.
   */
  it('refuses malformed opt-in: TRUE/43114', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase12(...literalFeeCases12[0]);
  });

  /**
   * @target getTx: refuses malformed opt-in: true/1
   * @dependencies Existing store entry point and feature configuration.
   * @scenario Set a malformed enabled value or unsupported enabled chain.
   * @expected Refusal occurs before any SDK request.
   */
  it('refuses malformed opt-in: true/1', async () => {
    expect.hasAssertions();
    return await runLiteralFeeCase12(...literalFeeCases12[1]);
  });
});
