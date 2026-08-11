import { NextRequest, NextResponse } from 'next/server'

const KURIER_BASE = process.env.KURIER_API_URL ?? 'https://api-testnet.kurier.xyz/api/v1'
const KURIER_KEY = process.env.KURIER_TESTNET_API_KEY ?? ''

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${KURIER_BASE}/register-vk/${KURIER_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
