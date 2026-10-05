/** Original single-fault action cases, disabled modes and invalid opt-in pairs. */
export const literalFeeCases4 = [
  'missing-authority',
  'missing-contract',
  'malformed',
  'empty',
  'wrong-chain',
  'changed-authority',
] as const;
export const literalFeeCases10 = [undefined, 'false'] as const;
export const literalFeeCases12 = [
  ['TRUE', '43114'],
  ['true', '1'],
] as const;
