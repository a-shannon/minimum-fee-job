import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/safeServerAction';
import { getPricesSafe } from '@/store';

import { queryClient } from './queryClient';

export const fetchPrices = async () => {
  return await queryClient.fetchQuery({
    queryKey: ['prices'],
    queryFn: async () => {
      return await unwrap(getPricesSafe)();
    },
  });
};

/** Read the existing price query when enabled so Avalanche snapshot consumers can disable its independent legacy fetch. */
export const usePrices = (enabled = true) => {
  return useQuery({
    enabled,
    queryKey: ['prices'],
    queryFn: async () => {
      return await unwrap(getPricesSafe)();
    },
  });
};
