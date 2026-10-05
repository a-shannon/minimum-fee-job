import { Validation } from '@/types';

import { validateAvalancheNetworkFee } from './validateAvalancheNetworkFee';
import { validateBridgeFeeByRsnRatio } from './validateBridgeFeeByRsnRatio';
import { validateBridgeFeeByToken } from './validateBridgeFeeByToken';
import { validateChainConfigsSameness } from './validateChainConfigsSameness';
import { validateNetworkFeeFactory } from './validateNetworkFeeFactory';
import { validateOldFeesConsistency } from './validateOldFeesConsistency';

/**
 * A list of all validations that should be run for supported bridge tokens
 */
export const validations: Validation[] = [
  {
    validate: validateOldFeesConsistency,
    title: 'Old Fees Consistency',
    id: 'old-fees-consistency',
    hint: 'All fees except the new one should exist in the box on the blockchain and be exactly the same',
  },
  {
    validate: validateChainConfigsSameness,
    title: 'Chain Configs Sameness',
    id: 'chain-configs-sameness',
    hint: 'bridgeFee, feeRatio, rsnRatio, and rsnRatioDivisor should be the same for all chains in the new config',
  },
  {
    validate: validateBridgeFeeByToken,
    title: 'Bridge Fee (Token)',
    id: 'bridge-fee-token',
    hint: 'Bridge fee calculation using token should be the expected predefined number',
  },
  {
    validate: validateBridgeFeeByRsnRatio,
    title: 'Bridge Fee (RSN ratio)',
    id: 'bridge-fee-rsn-ratio',
    hint: 'Bridge fee calculation using rsn ratio should be the expected predefined number',
  },
  {
    validate: validateNetworkFeeFactory(
      'ergo',
      (tokenConfig) => tokenConfig.fee.ergNetworkFee,
    ),
    title: 'Network Fee (Ergo)',
    id: 'network-fee-ergo',
    hint: 'Ergo network fee calculation should be the expected predefined number',
  },
  {
    validate: validateNetworkFeeFactory(
      'cardano',
      (tokenConfig) => tokenConfig.fee.adaNetworkFee,
    ),
    title: 'Network Fee (Cardano)',
    id: 'network-fee-cardano',
    hint: 'Cardano network fee calculation should be the expected predefined number',
  },
];

/** Selects the exact economic column applicable to a reviewed Avalanche publication. */
export const avalancheValidations = (publicationId: string): Validation[] => [
  {
    validate: validateAvalancheNetworkFee(publicationId),
    title: 'Network Fee (Avalanche)',
    id: 'network-fee-avalanche',
    hint: 'Exact published Avalanche updates are compared with the independently configured economic reference. Other targets have structural review only.',
  },
];
