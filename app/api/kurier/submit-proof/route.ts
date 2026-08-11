import { NextRequest, NextResponse } from 'next/server'

const KURIER_BASE = process.env.KURIER_API_URL ?? 'https://api-testnet.kurier.dev'
const KURIER_KEY = process.env.KURIER_API_KEY ?? ''

export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${KURIER_BASE}/v1/proof/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KURIER_KEY}`,
    },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
