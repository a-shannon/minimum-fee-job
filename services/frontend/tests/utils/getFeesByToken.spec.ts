import { getFeesByToken } from '../../src/utils/getFeesByToken';
import { native } from '../testData/avalanchePublicationFixture';
import { serve, setupExistingFeeUi } from '../testUtils/existingFeeUiStore';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('getFeesByToken', () => {
  describe('getFeesByToken', () => {
    setupExistingFeeUi();
    /**
     * @target getFeesByToken: uses the actual reviewed output index and exact fee fields
     * @dependencies Actual normal output at0 and configured fee output at1; real codec and authority.
     * @scenario Read fee data through the existing action and compare the token key and decoded output.
     * @expected The funding output is excluded and all five fields retain bigint units.
     */
    it('uses the actual reviewed output index and exact fee fields', async () => {
      const f = serve();
      const result = await getFeesByToken();
      expect(Object.keys(result)).toEqual([native]);
      expect(result[native][0]).toEqual({
        heights: { avalanche: 105, ergo: 105 },
        configs: {
          avalanche: {
            bridgeFee: 1n,
            networkFee: 3000000000n,
            rsnRatio: 2n,
            rsnRatioDivisor: 1000n,
            feeRatio: 3n,
          },
          ergo: {
            bridgeFee: 1n,
            networkFee: 9n,
            rsnRatio: 2n,
            rsnRatioDivisor: 1000n,
            feeRatio: 3n,
          },
        },
      });
      expect(f.fetch).toHaveBeenCalledOnce();
    });
  });
});
