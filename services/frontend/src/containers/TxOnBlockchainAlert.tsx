import { Alert } from '@mui/material';

import { useCheckTxOnBlockchain } from '@/queries';

/** Display the existing blockchain transaction check while forwarding the supplied transaction and query enablement. */
export const TxOnBlockchainAlert = ({
  tx,
  enabled = true,
}: {
  tx?: string;
  enabled?: boolean;
}) => {
  const { data, error, isLoading, isError } = useCheckTxOnBlockchain(
    tx,
    enabled,
  );

  let severity: 'info' | 'success' | 'error';
  let message: string;

  if (isLoading) {
    severity = 'info';
    message = 'Checking transaction on blockchain…';
  } else if (isError) {
    severity = 'error';
    message = `An error occurred: ${error.message}`;
  } else if (data) {
    severity = 'error';
    message = 'Tx already exists on blockchain';
  } else {
    severity = 'success';
    message = 'Tx is new and does not exist on blockchain';
  }

  return (
    <Alert severity={severity} className="!rounded-t-2xl">
      {message}
    </Alert>
  );
};
