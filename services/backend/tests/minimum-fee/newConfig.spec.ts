import { state } from '../mocked/avalancheFeeIntegration.mock';
import { state as publicationState } from '../mocked/avalancheFeePublication.mock';
import { publicationCases14 } from '../testData/avalancheFeePublicationCases';
import {
  methods,
  heights,
  initActualHandler,
  numericPrices,
  registerIntegrationContext,
} from '../testUtils/avalancheFeeIntegration';
import {
  setup as publicationSetup,
  heights as publicationHeights,
  registerPublicationContext as publicationRegisterPublicationContext,
} from '../testUtils/avalancheFeePublication';

describe('generateNewFeeConfig', () => {
  describe('qualified HTTP generation', () => {
    registerIntegrationContext();

    /**
     * @target generateNewFeeConfig preserves actual disabled legacy generation and ignores optional prices
     * @dependencies Actual integration/newConfig/updateConfig/TokenHandler sources, pinned tokens5 and minimum-fee3.1.2, loopback RPC; injected config, legacy fee reads and box fetch.
     * @scenario Disable Avalanche with a throwing optional price getter, initialize a legacy map, add the legacy ETH price, then generate/update and inspect absent Avalanche frontier and zero RPC calls.
     * @expected Preserves both legacy updates, omits Avalanche activation and never calls RPC or optional getters.
     */
    it('preserves actual disabled legacy generation and ignores optional prices', async () => {
      state.raw = {
        enabled: false,
        get tokenPrices() {
          throw Error('disabled read');
        },
      };
      await initActualHandler(undefined, true);
      const { generateNewFeeConfig } = await import(
          '../../src/minimum-fee/newConfig'
        ),
        { updateAndGenerateFeeConfig } = await import(
          '../../src/minimum-fee/updateConfig'
        );
      const prices = numericPrices();
      prices.set('eth', 1);
      const frontier = heights(),
        candidates = await generateNewFeeConfig(prices, frontier),
        updated = await updateAndGenerateFeeConfig(candidates, frontier);
      expect(updated.config.size).toEqual(2);
      expect(
        candidates.get('avax')!.getConfig().configs.ethereum,
      ).toBeDefined();
      expect(candidates.get('avax')!.getConfig().heights).not.toHaveProperty(
        'avalanche',
      );
      expect(frontier.has('avalanche')).toEqual(false);
      expect(methods).toHaveLength(0);
    });
  });
  describe('original publication authority', () => {
    publicationRegisterPublicationContext();
    const state = publicationState;
    const setup = publicationSetup;
    const heights = publicationHeights;
    /**
     * @target generateNewFeeConfig actual generation rejects original %s mutation at its first await
     * @dependencies Actual generation/update/construction/publisher and pinned minimum-fee3/WASM; original injected runtime plan, supported-token and external box observations; actual decoder and KV SDK where called.
     * @scenario Install a first-await legacy fee observation hook that changes only original numeric price or RSN authority, invoke actual generateNewFeeConfig and await its rejection.
     * @expected Actual generation rejects original authority drift at its first asynchronous observation.
     */
    it.each(publicationCases14)(
      'actual generation rejects original %s mutation at its first await',
      async (fault) => {
        await setup();
        state.generationHook = () => {
          if (fault === 'price') state.legacyPrices.set('avax', 3);
          else Reflect.set(state.fee as object, 'RSNTokenId', 'changed');
        };
        const { generateNewFeeConfig } = await import(
          '../../src/minimum-fee/newConfig'
        );
        await expect(
          generateNewFeeConfig(state.legacyPrices, heights()),
        ).rejects.toThrow('original publication inputs changed');
      },
    );
  });
});
