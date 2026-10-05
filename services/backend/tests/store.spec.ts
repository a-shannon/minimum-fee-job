import { state } from './mocked/avalancheFeeStore.mock';
import { publicationStoreCases2 } from './testData/avalancheFeeStoreCases';
import { registerContext } from './testUtils/avalancheFeeStoreContext';

describe('saveAvalanchePublication', () => {
  registerContext();
  /**
   * @target saveAvalanchePublication actual KV3/Redis1.34.2 emits exactly one SET containing one complete envelope
   * @dependencies Actual store and pinned KV3/Redis1.34.2 SDK; synthetic configuration and intercepted fetch only.
   * @scenario Intercept fetch, import the actual store using KV3/Redis1.34.2 and enqueue one complete envelope; inspect the exact pipeline request and payload.
   * @expected One SET carries the complete supplied envelope to the configured synthetic endpoint.
   */
  it('actual KV3/Redis1.34.2 emits exactly one SET containing one complete envelope', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ result: 'OK' }]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);
    const { saveAvalanchePublication } = await import('../src/store');
    const payload = JSON.stringify({
      version: 1,
      kind: 'empty',
      transaction: null,
    });
    await saveAvalanchePublication('avalanche-fee-publication-v1', payload);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toEqual('https://synthetic-kv.invalid/pipeline');
    expect(JSON.parse(options.body as string)).toEqual([
      ['set', 'avalanche-fee-publication-v1', payload],
    ]);
  });
  /**
   * @target saveAvalanchePublication fails closed with missing %s and never calls a transport
   * @dependencies Actual store and pinned KV3/Redis1.34.2 SDK; synthetic configuration and intercepted fetch only.
   * @scenario Remove only the table-selected URL, token or both configuration values, import the store and attempt publication with an observed fetch.
   * @expected Publication rejects missing KV authority synchronously and performs no transport call.
   */
  it.each(publicationStoreCases2)(
    'fails closed with missing %s and never calls a transport',
    async (fault) => {
      if (fault === 'url' || fault === 'both') state.url = undefined;
      if (fault === 'token' || fault === 'both') state.token = undefined;
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { saveAvalanchePublication } = await import('../src/store');
      expect(() =>
        saveAvalanchePublication('avalanche-fee-publication-v1', '{}'),
      ).toThrow('configured KV');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  /**
   * @target saveAvalanchePublication propagates a Redis command rejection instead of claiming publication
   * @dependencies Actual store and pinned KV3/Redis1.34.2 SDK; synthetic configuration and intercepted fetch only.
   * @scenario Return a synthetic Redis SET rejection through intercepted fetch and await the actual store publication.
   * @expected The command failure propagates without a publication success claim.
   */
  it('propagates a Redis command rejection instead of claiming publication', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([{ error: 'synthetic SET refused' }]), {
            status: 200,
          }),
      ),
    );
    const { saveAvalanchePublication } = await import('../src/store');
    await expect(
      saveAvalanchePublication('avalanche-fee-publication-v1', '{}'),
    ).rejects.toThrow('synthetic SET refused');
  });
});

describe('saveTx', () => {
  registerContext();
  /**
   * @target saveTx preserves the legacy missing-store no-op behavior
   * @dependencies Actual store and pinned KV3/Redis1.34.2 SDK; synthetic configuration and intercepted fetch only.
   * @scenario Remove both KV configuration values and invoke the actual legacy saveTx, savePrices and flushStore functions with an observed fetch.
   * @expected All three legacy calls retain their no-op behavior and never call transport.
   */
  it('preserves the legacy missing-store no-op behavior', async () => {
    state.url = undefined;
    state.token = undefined;
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { saveTx, savePrices, flushStore } = await import('../src/store');
    await expect(saveTx('legacy')).resolves.toBeUndefined();
    await expect(savePrices(new Map())).resolves.toBeUndefined();
    await expect(flushStore()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
});
