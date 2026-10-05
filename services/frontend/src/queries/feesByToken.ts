import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/safeServerAction';
import { getFeesByTokenSafe } from '@/utils';

import { queryClient } from './queryClient';

export const fetchFeesByToken = async () => {
  return await queryClient.fetchQuery({
    queryKey: ['feesByToken'],
    queryFn: async () => {
      return await unwrap(getFeesByTokenSafe)();
    },
  });
};

/** Read the existing fee query when enabled so Avalanche snapshot consumers can disable its independent legacy fetch. */
export const useFeesByToken = (enabled = true) => {
  return useQuery({
    enabled,
    queryKey: ['feesByToken'],
    queryFn: async () => {
      return await unwrap(getFeesByTokenSafe)();
    },
  });
};
