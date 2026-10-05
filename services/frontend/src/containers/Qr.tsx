import { Box, CircularProgress, Typography } from '@mui/material';
import type { UseQueryResult } from '@tanstack/react-query';

import { QrDisplay } from '@/components';
import { TxOnBlockchainAlert } from '@/containers';
import { useTx } from '@/queries';

import type { AvalancheFeeUiSnapshot } from '../avalanche/existingUi';

/**
 * Qr container
 */
export const Qr = ({
  snapshot,
}: {
  snapshot?: UseQueryResult<AvalancheFeeUiSnapshot>;
}) => {
  const legacy = useTx(!snapshot);
  const data = snapshot ? snapshot.data?.tx : legacy.data;
  const isLoading = snapshot
    ? snapshot.isLoading || snapshot.isFetching
    : legacy.isLoading;
  const isError = snapshot ? snapshot.isError : legacy.isError;
  return (
    <>
      {(!snapshot || (!isLoading && !isError && data)) && (
        <TxOnBlockchainAlert tx={snapshot ? data : undefined} />
      )}
      {isLoading && (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          minHeight={380}
        >
          Loading tx &nbsp;
          <CircularProgress size={12} />
        </Box>
      )}
      {!isLoading && !isError && data && <QrDisplay tx={data || ''} />}
      {!isLoading && isError && (
        <Box
          width={380}
          height={380}
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          p={2}
        >
          <Typography variant="h6" color="error" align="center">
            An error occurred while fetching tx from the store
          </Typography>
        </Box>
      )}
    </>
  );
};
