import { useQuery } from '@tanstack/react-query';

import { TokenMap } from '@rosen-bridge/tokens';

import { unwrap } from '@/safeServerAction';
import { getRosenTokensSafe } from '@/store';

import { queryClient } from './queryClient';

export const fetchTokenMap = async () => {
  return await queryClient.fetchQuery({
    queryKey: ['tokenMap'],
    queryFn: async () => {
      const data = await unwrap(getRosenTokensSafe)();

      const tokenMap = new TokenMap();

      await tokenMap.updateConfigByJson(data);

      return tokenMap;
    },
  });
};

/** Read and initialize the existing TokenMap query when enabled. */
export const useTokenMap = (enabled = true) => {
  return useQuery({
    enabled,
    queryKey: ['tokenMap'],
    queryFn: async () => {
      const data = await unwrap(getRosenTokensSafe)();

      const tokenMap = new TokenMap();

      await tokenMap.updateConfigByJson(data);

      return tokenMap;
    },
  });
};
