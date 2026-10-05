const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_INT = 2147483647;

export type AvalancheFeeConfig =
  | Readonly<{ enabled: false }>
  | Readonly<{
      enabled: true;
      chainId: 43113n | 43114n;
      rpcUrl: string;
      requestTimeoutMs: number;
      gasBudget: bigint;
      margin: Readonly<{ numerator: bigint; denominator: bigint }>;
      activationDelay: number;
    }>;

/** Validates a configured integer against its minimum and the signed 32-bit bound. */
const integer = (value: unknown, name: string, minimum: number): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > MAX_INT
  )
    throw new Error(`Invalid Avalanche ${name}`);
  return value;
};

/** Parses canonical positive decimal text within the uint256 amount bound. */
const amount = (value: unknown, name: string): bigint => {
  if (
    typeof value !== 'string' ||
    value.length > 78 ||
    !/^[1-9][0-9]*$/.test(value)
  )
    throw new Error(`Invalid Avalanche ${name}`);
  const result = BigInt(value);
  if (result > MAX_UINT256) throw new Error(`Invalid Avalanche ${name}`);
  return result;
};

/** Optional section only. Disabled configuration never reads optional fields. */
export const readAvalancheFeeConfig = (raw?: unknown): AvalancheFeeConfig => {
  if (raw === undefined) return Object.freeze({ enabled: false });
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid Avalanche fee configuration');
  const values = raw as Record<string, unknown>;
  const enabled = values.enabled;
  if (enabled === false) return Object.freeze({ enabled: false });
  if (enabled !== true) throw new Error('Invalid Avalanche enabled flag');
  const chainId = values.chainId;
  if (chainId !== 43113 && chainId !== 43114)
    throw new Error('Invalid Avalanche chain ID');
  const rpcUrl = values.rpcUrl;
  if (typeof rpcUrl !== 'string' || rpcUrl.trim() !== rpcUrl)
    throw new Error('Invalid Avalanche RPC URL');
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error('Invalid Avalanche RPC URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.hash)
    throw new Error('Invalid Avalanche RPC URL');
  const requestTimeoutMs = integer(
    values.requestTimeoutMs,
    'request timeout',
    1,
  );
  const activationDelay = integer(
    values.activationDelay,
    'activation delay',
    0,
  );
  const gasBudget = amount(values.gasBudget, 'gas budget');
  const rawMargin = values.margin;
  if (!rawMargin || typeof rawMargin !== 'object' || Array.isArray(rawMargin))
    throw new Error('Invalid Avalanche margin');
  const marginValues = rawMargin as Record<string, unknown>;
  const numerator = amount(marginValues.numerator, 'margin numerator');
  const denominator = amount(marginValues.denominator, 'margin denominator');
  if (numerator < denominator)
    throw new Error('Avalanche margin must not reduce fee');
  return Object.freeze({
    enabled: true,
    chainId: BigInt(chainId) as 43113n | 43114n,
    rpcUrl,
    requestTimeoutMs,
    gasBudget,
    margin: Object.freeze({ numerator, denominator }),
    activationDelay,
  });
};
