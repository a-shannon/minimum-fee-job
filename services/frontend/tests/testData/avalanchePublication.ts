/** Structural report bindings altered independently before rendering. */
export const structuralFaults = [
  'publicationId',
  'chain',
  'kind',
  'transactionId',
] as const;

/** Economic comparison bindings altered independently before rendering. */
export const economicFaults = [
  'publicationId',
  'transactionId',
  'scope',
  'reference hash',
  'V1',
  'missing structure',
] as const;
