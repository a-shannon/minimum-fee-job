import { fetchAvalancheFeeUi } from '../../src/queries/avalancheFeeUi';
import { queryClient } from '../../src/queries/queryClient';
import { validateAvalancheNetworkFee } from '../../src/validations/validateAvalancheNetworkFee';
import { native } from '../testData/avalanchePublicationFixture';
import { serve, setupExistingFeeUi } from '../testUtils/existingFeeUiStore';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('validateAvalancheNetworkFee', () => {
  describe('validateAvalancheNetworkFee', () => {
    setupExistingFeeUi();
    /**
     * @target validateAvalancheNetworkFee: refuses stale shared query refresh through bound validation
     * @dependencies Actual TanStack cache and independently reviewed publication A and B.
     * @scenario Cache A; validate against A; publish B and refresh the bound validator.
     * @expected Refresh rejects, sets query error, and never replaces A with unbound B.
     */
    it('refuses stale shared query refresh through bound validation', async () => {
      const first = serve();
      const snapshot = await fetchAvalancheFeeUi(first.packet.publicationId);
      expect(
        await validateAvalancheNetworkFee(snapshot.publicationId)(native),
      ).toMatchObject({ isValid: true });
      serve(0.2);
      await expect(
        validateAvalancheNetworkFee(snapshot.publicationId)(native),
      ).rejects.toThrow('unavailable');
      expect(queryClient.getQueryState(['avalanche-fee-ui'])?.status).toEqual(
        'error',
      );
      expect(
        queryClient.getQueryData<{ publicationId: string }>([
          'avalanche-fee-ui',
        ])?.publicationId,
      ).toEqual(snapshot.publicationId);
    });
  });
});
