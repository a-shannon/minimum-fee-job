import { state } from '../mocked/avalancheFeeIntegration.mock';
import {
  native,
  asset,
  address,
  integrationCases13,
  integrationCases18,
} from '../testData/avalancheFeeIntegration';
import {
  methods,
  raw,
  heights,
  common,
  initActualHandler,
  numericPrices,
  makeOldBox,
  registerIntegrationContext,
} from '../testUtils/avalancheFeeIntegration';

describe('updateAndGenerateFeeConfig', () => {
  registerIntegrationContext();

  /**
   * @target updateAndGenerateFeeConfig preserves Avalanche guarantee history during actual cleanup
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Initialize the real handler and an old box with three Avalanche activation heights; generate and update actual fee configs, then inspect which guaranteed historical heights survive.
   * @expected Retains guaranteed activation heights20 and95 before the new105 entry.
   */
  it('preserves Avalanche guarantee history during actual cleanup', async () => {
    await initActualHandler();
    const old = (ergo: number, avalanche: number) => ({
      heights: { ergo, avalanche },
      configs: { ergo: common(), avalanche: common() },
    });
    state.boxes.set(
      native,
      makeOldBox(native, [old(0, 0), old(20, 20), old(40, 95)]),
    );
    const { generateNewFeeConfig } = await import(
        '../../src/minimum-fee/newConfig'
      ),
      { updateAndGenerateFeeConfig } = await import(
        '../../src/minimum-fee/updateConfig'
      );
    const frontier = heights(),
      candidates = await generateNewFeeConfig(numericPrices(), frontier),
      updated = await updateAndGenerateFeeConfig(candidates, frontier);
    expect(
      updated.config
        .get('avax')!
        .new.getConfigs()
        .map(
          (fee: { heights: Record<string, number> }) => fee.heights.avalanche,
        ),
    ).toEqual([20, 95, 105]);
  });

  /**
   * @target updateAndGenerateFeeConfig treats the current finalized height as not yet activated in Avalanche cleanup
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Seed a real prior box with activation heights below and equal to the finalized frontier; generate and update configs, then inspect removal of the not-yet-active equal-height row.
   * @expected Retains height99 and new105 while removing the inactive equal-finalized100 entry.
   */
  it('treats the current finalized height as not yet activated in Avalanche cleanup', async () => {
    await initActualHandler();
    const old = (avalanche: number) => ({
      heights: { avalanche },
      configs: { avalanche: common() },
    });
    state.boxes.set(native, makeOldBox(native, [old(99), old(100)]));
    const { generateNewFeeConfig } = await import(
        '../../src/minimum-fee/newConfig'
      ),
      { updateAndGenerateFeeConfig } = await import(
        '../../src/minimum-fee/updateConfig'
      );
    const frontier = heights(),
      candidates = await generateNewFeeConfig(numericPrices(), frontier),
      updated = await updateAndGenerateFeeConfig(candidates, frontier);
    expect(
      updated.config
        .get('avax')!
        .new.getConfigs()
        .map(
          (fee: { heights: Record<string, number> }) => fee.heights.avalanche,
        ),
    ).toEqual([99, 105]);
  });

  /**
   * @target updateAndGenerateFeeConfig rejects %s drift during the actual asynchronous fee-box fetch
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Generate authentic candidates and during the real asynchronous box fetch mutate only the candidate fee, enabled policy, frontier height or supported-token decimals from the documented table; resume update.
   * @expected Rejects every isolated drift after awaiting the actual fee-box fetch.
   */
  it.each(integrationCases13)(
    'rejects %s drift during the actual asynchronous fee-box fetch',
    async (fault) => {
      const handler = await initActualHandler();
      const { generateNewFeeConfig } = await import(
          '../../src/minimum-fee/newConfig'
        ),
        { updateAndGenerateFeeConfig } = await import(
          '../../src/minimum-fee/updateConfig'
        );
      const frontier = heights(),
        candidates = await generateNewFeeConfig(numericPrices(), frontier);
      state.fetchHook = async () => {
        if (fault === 'candidate')
          candidates.get('avax')!.getConfig().configs.ergo.bridgeFee = 999n;
        if (fault === 'policy')
          (state.raw as ReturnType<typeof raw>).enabled = false;
        if (fault === 'frontier') frontier.set('avalanche', 99);
        if (fault === 'token source')
          handler.getSupportedTokens()[0].decimals = 0;
      };
      await expect(
        updateAndGenerateFeeConfig(candidates, frontier),
      ).rejects.toThrow();
    },
  );

  /**
   * @target updateAndGenerateFeeConfig requires regeneration after an asynchronous consumer failure
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Generate authentic candidates, throw during asynchronous box fetch, clear the failure hook, then retry the consumed candidate batch.
   * @expected Propagates the original fetch failure and rejects retry of the consumed batch.
   */
  it('requires regeneration after an asynchronous consumer failure', async () => {
    await initActualHandler();
    const { generateNewFeeConfig } = await import(
        '../../src/minimum-fee/newConfig'
      ),
      { updateAndGenerateFeeConfig } = await import(
        '../../src/minimum-fee/updateConfig'
      );
    const frontier = heights(),
      candidates = await generateNewFeeConfig(numericPrices(), frontier);
    state.fetchHook = async () => {
      throw Error('fixture transport');
    };
    await expect(
      updateAndGenerateFeeConfig(candidates, frontier),
    ).rejects.toThrow('fixture transport');
    state.fetchHook = undefined;
    await expect(
      updateAndGenerateFeeConfig(candidates, frontier),
    ).rejects.toThrow('consumed');
  });

  /**
   * @target updateAndGenerateFeeConfig rejects an older consumer when a new generation starts during its fetch
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Generate authentic candidates, start a newer generation using real handler data during the box fetch, then resume the older update.
   * @expected Rejects the older consumer as superseded after its asynchronous fetch.
   */
  it('rejects an older consumer when a new generation starts during its fetch', async () => {
    const handler = await initActualHandler();
    const { generateNewFeeConfig } = await import(
        '../../src/minimum-fee/newConfig'
      ),
      { updateAndGenerateFeeConfig } = await import(
        '../../src/minimum-fee/updateConfig'
      ),
      { beginAvalancheFeeGeneration } = await import(
        '../../src/minimum-fee/avalancheFeeIntegration'
      );
    const frontier = heights(),
      candidates = await generateNewFeeConfig(numericPrices(), frontier);
    state.fetchHook = async () => {
      beginAvalancheFeeGeneration(() => ({
        tokens: handler.getSupportedTokens(),
        rawMap: handler.getOriginalTokenMap(),
        currentRawMap: handler.getTokenMap().getRawConfig(),
      }));
    };
    await expect(
      updateAndGenerateFeeConfig(candidates, frontier),
    ).rejects.toThrow('superseded');
  });

  /**
   * @target updateAndGenerateFeeConfig rejects stored Avalanche history in the actual disabled cleanup flow
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Disable Avalanche, initialize a legacy map and seed an old box retaining Avalanche history; run actual generation/update and inspect the history rejection without RPC.
   * @expected Rejects stored Avalanche history during disabled cleanup without RPC.
   */
  it('rejects stored Avalanche history in the actual disabled cleanup flow', async () => {
    state.raw = { enabled: false };
    await initActualHandler(undefined, true);
    state.boxes.set(
      native,
      makeOldBox(native, [
        {
          heights: { avalanche: 0, ergo: 0 },
          configs: { avalanche: common(), ergo: common() },
        },
      ]),
    );
    const { generateNewFeeConfig } = await import(
        '../../src/minimum-fee/newConfig'
      ),
      { updateAndGenerateFeeConfig } = await import(
        '../../src/minimum-fee/updateConfig'
      );
    const prices = numericPrices();
    prices.set('eth', 1);
    const frontier = heights(),
      candidates = await generateNewFeeConfig(prices, frontier);
    await expect(
      updateAndGenerateFeeConfig(candidates, frontier),
    ).rejects.toThrow('history');
    expect(methods).toHaveLength(0);
  });

  /**
   * @target updateAndGenerateFeeConfig actual update only changes Avalanche fees when exact threshold is exceeded: %s
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Generate authentic candidates and seed prior boxes with equal fees or only the documented exceeded AVAX network fee; update the batch and inspect selected token changes.
   * @expected Updates AVAX only in the exceeded branch and leaves the equal asset fee unchanged.
   */
  it.each(integrationCases18)(
    'actual update only changes Avalanche fees when exact threshold is exceeded: %s',
    async (exceeded) => {
      await initActualHandler();
      const { generateNewFeeConfig } = await import(
          '../../src/minimum-fee/newConfig'
        ),
        { updateAndGenerateFeeConfig } = await import(
          '../../src/minimum-fee/updateConfig'
        );
      const frontier = heights(),
        candidates = await generateNewFeeConfig(numericPrices(), frontier);
      for (const [id, candidate] of candidates) {
        const previous = structuredClone(candidate.getConfig());
        for (const chain of Object.keys(previous.heights))
          previous.heights[chain] = 0;
        if (id === 'avax')
          previous.configs.avalanche.networkFee = exceeded
            ? 30000000000n
            : 33000000000n;
        state.boxes.set(
          id === 'avax' ? native : asset,
          makeOldBox(id === 'avax' ? native : asset, [previous]),
        );
      }
      const result = await updateAndGenerateFeeConfig(candidates, frontier);
      expect(result.config.has('avax')).toEqual(exceeded);
      expect(result.config.has(address)).toEqual(false);
    },
  );

  /**
   * @target updateAndGenerateFeeConfig returns no partial batch when the last asset fetch fails
   * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
   * @scenario Generate a two-asset authentic candidate batch, fail only its last box fetch, and inspect rejection before the caller can mark a partial batch as published.
   * @expected Rejects the final failed fetch and leaves the caller publication flag false.
   */
  it('returns no partial batch when the last asset fetch fails', async () => {
    await initActualHandler();
    const { generateNewFeeConfig } = await import(
        '../../src/minimum-fee/newConfig'
      ),
      { updateAndGenerateFeeConfig } = await import(
        '../../src/minimum-fee/updateConfig'
      );
    const frontier = heights(),
      candidates = await generateNewFeeConfig(numericPrices(), frontier);
    let calls = 0,
      published = false;
    state.fetchHook = async () => {
      if (++calls === 2) throw Error('last asset failure');
    };
    await expect(
      updateAndGenerateFeeConfig(candidates, frontier).then(() => {
        published = true;
      }),
    ).rejects.toThrow('last asset failure');
    expect(calls).toEqual(2);
    expect(published).toEqual(false);
  });
});
