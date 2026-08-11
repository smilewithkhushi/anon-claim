import { defineChain } from 'viem'

// Verified on Horizen testnet:
// https://explorer-testnet.horizen.io/address/0x03225ff1ff4F1BAc6e81BB6317006A509422D51C?tab=contract
export const ZK_VERIFY_AGGREGATION_ADDRESS = '0x03225ff1ff4F1BAc6e81BB6317006A509422D51C' as const

export const horizenTestnet = defineChain({
  id: 2651420,
  name: 'Horizen Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_HORIZEN_RPC_URL ?? 'https://rpc-testnet.horizen.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Horizen Explorer',
      url: 'https://explorer-testnet.horizen.io',
    },
  },
  testnet: true,
})
