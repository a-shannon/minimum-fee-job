type Mutable<T, D extends unknown[] = []> = D['length'] extends 6
  ? T
  : T extends object
    ? { -readonly [P in keyof T]: Mutable<T[P], [...D, unknown]> }
    : T;

/** Copies a fixture value while retaining its bounded mutable test type. */
export const clone = <T>(value: T): Mutable<T> =>
  structuredClone(value) as Mutable<T>;
