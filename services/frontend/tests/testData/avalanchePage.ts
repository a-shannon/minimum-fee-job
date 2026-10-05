/** Absent and disabled opt-in values that retain the legacy page. */
export const legacyOptIns = [undefined, 'false'];

/** Supported opt-in chain strings passed to the atomic consumer. */
export const supportedChains = ['43113', '43114'];

/** Invalid opt-in and chain pairs that disable both page consumers. */
export const invalidOptIns: Array<[string, string | undefined]> = [
  ['true', undefined],
  ['true', '1'],
  ['yes', '43113'],
  ['', '43113'],
];
