import { defineChain } from 'viem'

// ZkVerifyAggregation contract on Horizen testnet (L3 on Base Sepolia)
// https://explorer-testnet.horizen.io/address/0x03225ff1ff4F1BAc6e81BB6317006A509422D51C?tab=contract
export const ZK_VERIFY_AGGREGATION_ADDRESS = '0x03225ff1ff4F1BAc6e81BB6317006A509422D51C' as const

export const horizenTestnet = defineChain({
  id: 2651420,
  name: 'Horizen Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_HORIZEN_RPC_URL ?? 'https://horizen-testnet.rpc.caldera.xyz/http'],
      webSocket: ['wss://horizen-testnet.rpc.caldera.xyz/ws'],
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

export const horizenMainnet = defineChain({
  id: 26514,
  name: 'Horizen',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://horizen.calderachain.xyz/http'],
      webSocket: ['wss://horizen.calderachain.xyz/ws'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Horizen Explorer',
      url: 'https://explorer.horizen.io',
    },
  },
})
