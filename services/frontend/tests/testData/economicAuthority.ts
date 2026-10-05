/** Literal parameter tables for captureEconomicAuthority scenarios. */
/** Parameter variants for captures and deeply freezes chain %s without retaining an owner object. */
export const economicAuthorityCases0 = [43113, 43114] as const;

/** Parameter variants for rejects nonlocal or device path %j before open. */
export const economicAuthorityCases2 = [
  'relative.json',
  '/absolute-posix.json',
  '\\\\server\\share\\file.json',
  '//server/share/file.json',
  '\\\\?\\C:\\authority.json',
  '\\\\.\\NUL',
  'C:relative.json',
  'C:/NUL',
  'C:/NUL ',
  'C:/CON.',
  'C:/folder/COM1.json',
  'C:/file.json:stream',
  'C:/bad\u0000.json',
];

/** Parameter variants for rejects invalid configured digest %j. */
export const economicAuthorityCases3 = [
  undefined,
  null,
  '',
  'AB'.repeat(32),
  'ab'.repeat(31),
  true,
];

/** Parameter variants for sanitizes %s and closes any opened descriptor. */
export const economicAuthorityCases5 = [
  'missing',
  'directory',
  'read-error',
] as const;

/** Parameter variants for rejects isolated root %s schema fault. */
export const economicAuthorityCases6 = [
  'schema',
  'chain',
  'publicationId',
  'extra',
  'policy',
  'observations',
] as const;

/** Parameter variants for rejects duplicate JSON object keys in %s. */
export const economicAuthorityCases7 = [
  [
    'root schema version',
    '"schemaVersion":1',
    '"schemaVersion":2,"schemaVersion":1',
  ],
  ['nested fee field', '"policy":{}', '"policy":{"group":{"rate":1,"rate":2}}'],
  [
    'escaped nested fee field',
    '"policy":{}',
    String.raw`"policy":{"group":{"rate":1,"r\u0061te":2}}`,
  ],
  [
    'object inside array',
    '"policy":{}',
    '"policy":{"groups":[{"rate":1,"rate":2}]}',
  ],
];

/** Parameter variants for rejects dangerous JSON key %s. */
export const economicAuthorityCases9 = [
  '__proto__',
  'constructor',
  'prototype',
];

/** Parameter variants for rejects bounded JSON fault %s. */
export const economicAuthorityCases10 = [
  'depth',
  'nodes',
  'array',
  'nonfinite',
  'syntax',
  'utf8',
] as const;

/** Parameter variants for freshness assertion rejects %s without exposing internals. */
export const economicAuthorityCases14 = [
  'changed',
  'removed',
  'growth',
  'read-error',
] as const;
