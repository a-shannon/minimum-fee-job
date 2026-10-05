import { queryClient } from '../../src/queries/queryClient';
import { getTx } from '../../src/store';
import { getFeesByToken } from '../../src/utils/getFeesByToken';
import { serve, setupExistingFeeUi } from '../testUtils/existingFeeUiStore';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('queryClient', () => {
  describe('queryClient.fetchQuery', () => {
    setupExistingFeeUi();
    /**
     * @target queryClient.fetchQuery: permits separate fee and transaction publication identities in existing query keys
     * @dependencies Actual existing query cache, atomic store actions and two reviewed publications.
     * @scenario Fetch table fees from A; serve B and fetch the existing tx key; then request tx bound to A.
     * @expected Unbound existing keys accept B while the new expected-publication argument refuses it.
     */
    it('permits separate fee and transaction publication identities in existing query keys', async () => {
      queryClient.clear();
      const first = serve();
      await queryClient.fetchQuery({
        queryKey: ['feesByToken'],
        queryFn: getFeesByToken,
      });
      const second = serve(0.2);
      expect(second.packet.publicationId).not.toEqual(
        first.packet.publicationId,
      );
      expect(
        await queryClient.fetchQuery({
          queryKey: ['tx'],
          queryFn: () => getTx(),
        }),
      ).toEqual(JSON.stringify(second.packet.transaction));
      await expect(getTx(first.packet.publicationId)).rejects.toThrow(
        'unavailable',
      );
      queryClient.clear();
    });
  });
});
