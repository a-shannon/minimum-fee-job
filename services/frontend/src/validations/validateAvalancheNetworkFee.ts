import { fetchAvalancheFeeUi } from '../queries/avalancheFeeUi';
import type { Validate } from '../types';

/** Binds exact economic validation to the same publication as the table and QR. */
export const validateAvalancheNetworkFee =
  (publicationId: string): Validate =>
  async (tokenId) => {
    const snapshot = await fetchAvalancheFeeUi(publicationId);
    const result = snapshot.validationResults[tokenId];
    if (!result) throw new Error('Avalanche token validation is unavailable');
    return result;
  };
