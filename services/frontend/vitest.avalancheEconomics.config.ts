import structure from './vitest.avalancheStructure.config';

export default {
  ...structure,
  test: { ...structure.test, include: ['tests/avalanche/economics.spec.ts'] },
};
