import { defineChain } from 'viem'

// ZkVerifyAggregation PROXY on Horizen testnet — this is the address that holds aggregation state.
// Implementation (0x03225ff1...) is behind this proxy; calling the implementation directly returns empty data.
// https://explorer-testnet.horizen.io/address/0xCC02D0A54F3184dF4c88811E5b9FAb7ff8131e4a?tab=contract
export const ZK_VERIFY_AGGREGATION_ADDRESS = '0xCC02D0A54F3184dF4c88811E5b9FAb7ff8131e4a' as const

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
