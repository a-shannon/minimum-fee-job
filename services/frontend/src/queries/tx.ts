import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/safeServerAction';
import { getTxSafe } from '@/store';

/** Read the existing transaction query when enabled. */
export const useTx = (enabled = true) => {
  return useQuery({
    enabled,
    queryKey: ['tx'],
    queryFn: async () => {
      return await unwrap(getTxSafe)();
    },
  });
};
