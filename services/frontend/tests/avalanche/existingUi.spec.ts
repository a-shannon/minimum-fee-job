import {
  avalancheUiFeesByToken,
  requireReviewedAvalancheUi,
} from '../../src/avalanche/existingUi';
import { loadAvalanchePublication } from '../../src/store/avalanchePublication';
import { native } from '../testData/avalanchePublicationFixture';
import { serve, setupExistingFeeUi } from '../testUtils/existingFeeUiStore';

vi.mock('@rosen-bridge/minimum-fee', async () => {
  const { pinnedFeeDependencies } = await import(
    '../../../backend/tests/fixtures/pinnedFeeDependencies'
  );
  return pinnedFeeDependencies().fees;
});
describe('avalancheUiFeesByToken', () => {
  setupExistingFeeUi();
  /**
   * @target avalancheUiFeesByToken: preserves a reviewed Long above Number precision
   * @dependencies Admitted actual structural report and the exact decimal projection.
   * @scenario Change only the supplied structural report field to a valid large Long; project it.
   * @expected Projection never converts the decimal through Number.
   */
  it('preserves a reviewed Long above Number precision', async () => {
    serve();
    const snapshot = requireReviewedAvalancheUi(
      await loadAvalanchePublication(),
    );
    const copy = structuredClone(snapshot);
    Object.assign(copy.review.feeOutputs[0].fees[0].configs.avalanche, {
      networkFee: '9007199254740993',
    });
    expect(
      avalancheUiFeesByToken(copy)[native][0].configs.avalanche.networkFee,
    ).toEqual(9007199254740993n);
  });
});
