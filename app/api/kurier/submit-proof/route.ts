import { NextRequest, NextResponse } from 'next/server'

const KURIER_BASE = process.env.KURIER_API_URL ?? 'https://api-testnet.kurier.xyz/api/v1'
const KURIER_KEY = process.env.KURIER_TESTNET_API_KEY ?? ''
const HORIZEN_CHAIN_ID = 2651420

export async function POST(req: NextRequest) {
  const { proof, publicInputs, vkHash } = await req.json()

  const kurierPayload = {
    proofType: 'ultrahonk',
    vkRegistered: true,
    chainId: HORIZEN_CHAIN_ID,
    proofOptions: { variant: 'zk' },
    proofData: {
      proof,
      publicSignals: publicInputs,
      vk: vkHash,
    },
  }

  const res = await fetch(`${KURIER_BASE}/submit-proof/${KURIER_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kurierPayload),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
