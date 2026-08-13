import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const KURIER_BASE = process.env.KURIER_API_URL ?? 'https://api-testnet.kurier.xyz/api/v1'
const KURIER_KEY = process.env.KURIER_TESTNET_API_KEY ?? ''
const HORIZEN_CHAIN_ID = 2651420

// Read VK bytes once at module load. Passing the full VK inline avoids needing
// a separate VK-registration step and survives Kurier server resets.
const VK_PATH = path.join(process.cwd(), 'circuit/target/vk/vk')
const VK_HEX = '0x' + fs.readFileSync(VK_PATH).toString('hex')

export async function POST(req: NextRequest) {
  const { proof, publicInputs } = await req.json()

  const kurierPayload = {
    proofType: 'ultrahonk',
    vkRegistered: false,
    chainId: HORIZEN_CHAIN_ID,
    proofOptions: { variant: 'zk' },
    proofData: {
      proof,
      publicSignals: publicInputs,
      vk: VK_HEX,
    },
  }

  const res = await fetch(`${KURIER_BASE}/submit-proof/${KURIER_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kurierPayload),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('[kurier/submit-proof] error:', JSON.stringify(data))
  }
  return NextResponse.json(data, { status: res.status })
}
