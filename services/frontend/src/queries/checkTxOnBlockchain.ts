import { useQuery } from '@tanstack/react-query';

import { unwrap } from '@/safeServerAction';
import { getTxSafe } from '@/store';
import { checkTxOnBlockchainSafe } from '@/utils';

/** Check the supplied transaction when enabled, or read the existing transaction action when no transaction is supplied. */
export const useCheckTxOnBlockchain = (tx?: string, enabled = true) => {
  return useQuery({
    queryKey:
      tx === undefined ? ['checkTxOnBlockchain'] : ['checkTxOnBlockchain', tx],
    enabled,
    queryFn: async () => {
      return await unwrap(checkTxOnBlockchainSafe)(
        tx ?? (await unwrap(getTxSafe)()),
      );
    },
  });
};
