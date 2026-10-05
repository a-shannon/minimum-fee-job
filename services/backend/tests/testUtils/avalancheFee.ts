/** Builds the unchanged enabled fee configuration fixture. */
export const rawConfig = () => ({
  enabled: true,
  chainId: 43113,
  rpcUrl: 'https://rpc.invalid/path?key=fixture',
  requestTimeoutMs: 100,
  gasBudget: '21000',
  margin: { numerator: '11', denominator: '10' },
  activationDelay: 5,
});
