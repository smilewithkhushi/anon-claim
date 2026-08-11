import { defineChain } from 'viem'

export const horizenTestnet = defineChain({
  id: 2651420,
  name: 'Horizen Testnet',
  nativeCurrency: { name: 'ZEN', symbol: 'ZEN', decimals: 18 },
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
