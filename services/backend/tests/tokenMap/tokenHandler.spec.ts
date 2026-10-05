import {
  methods,
  heights,
  initActualHandler,
  numericPrices,
  registerIntegrationContext,
} from '../testUtils/avalancheFeeIntegration';

describe('TokenHandler', () => {
  registerIntegrationContext();
  describe('init', () => {
    /**
     * @target TokenHandler.init / TokenHandler.getOriginalTokenMap runs actual generation through update/cleanup with real3.1.2 models and immutable original tokens5 source
     * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
     * @scenario Initialize the real TokenHandler from an intercepted synthetic JSON file, verify its immutable original map, then run real generation and update/cleanup while checking the original candidates and single-use authority.
     * @expected Freezes the original token map, returns both updated assets, preserves candidate fields and rejects reuse.
     */
    it('runs actual generation through update/cleanup with real3.1.2 models and immutable original tokens5 source', async () => {
      const handler = await initActualHandler();
      expect(Object.isFrozen(handler.getOriginalTokenMap())).toEqual(true);
      const { generateNewFeeConfig } = await import(
          '../../src/minimum-fee/newConfig'
        ),
        { updateAndGenerateFeeConfig } = await import(
          '../../src/minimum-fee/updateConfig'
        );
      const frontier = heights(),
        candidates = await generateNewFeeConfig(numericPrices(), frontier),
        before = structuredClone(candidates.get('avax')!.getConfig());
      const updated = await updateAndGenerateFeeConfig(candidates, frontier);
      expect(updated.config.size).toEqual(2);
      expect(candidates.get('avax')!.getConfig()).toEqual(before);
      expect(
        updated.config.get('avax')!.new.getConfigs()[0].configs.avalanche
          .networkFee,
      ).toEqual(33000000000n);
      expect(
        updated.config.get('avax')!.new.getConfigs()[0].heights.avalanche,
      ).toEqual(105);
      expect(() => updated.config.get('avax')!.new.build()).not.toThrow();
      expect(methods).toHaveLength(5);
      await expect(
        updateAndGenerateFeeConfig(candidates, frontier),
      ).rejects.toThrow('consumed');
    });
  });
});
