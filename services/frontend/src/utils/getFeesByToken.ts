'use server';

import { wrap } from '@/safeServerAction';
import { getTx } from '@/store';

import {
  avalancheUiFeesByToken,
  avalancheUiRequested,
  requireReviewedAvalancheUi,
} from '../avalanche/existingUi';
import { loadAvalanchePublication } from '../store/avalanchePublication';
import { extractTxData } from './extractTxData';

/**
 * Get a Result object containing either fees config indexed by token id, or an
 * error
 */
export const getFeesByToken = async () => {
  if (avalancheUiRequested())
    return avalancheUiFeesByToken(
      requireReviewedAvalancheUi(await loadAvalanchePublication()),
    );
  return extractTxData(await getTx());
};

export const getFeesByTokenSafe = wrap(getFeesByToken);
