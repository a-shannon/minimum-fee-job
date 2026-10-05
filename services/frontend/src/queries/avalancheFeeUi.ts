import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/safeServerAction';

import type { AvalancheFeeUiSnapshot } from '../avalanche/existingUi';
import { loadAvalancheFeeUiSafe } from '../store/avalanchePublication';
import { queryClient } from './queryClient';

const queryKey = ['avalanche-fee-ui'];

/** Refreshes the shared query only for the publication already displayed. */
export const fetchAvalancheFeeUi = async (publicationId: string) =>
  queryClient.fetchQuery({
    queryKey,
    queryFn: () => unwrap(loadAvalancheFeeUiSafe)(publicationId),
    staleTime: 0,
  });

/** Uses the existing query cache for one table/QR snapshot and bound refreshes. */
export const useAvalancheFeeUi = (enabled: boolean) =>
  useQuery({
    queryKey,
    enabled,
    queryFn: () =>
      unwrap(loadAvalancheFeeUiSafe)(
        queryClient.getQueryData<AvalancheFeeUiSnapshot>(queryKey)
          ?.publicationId,
      ),
  });
