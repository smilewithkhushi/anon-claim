import { NextRequest, NextResponse } from 'next/server'

const KURIER_BASE = process.env.KURIER_API_URL ?? 'https://api-testnet.kurier.dev'
const KURIER_KEY = process.env.KURIER_API_KEY ?? ''

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const res = await fetch(`${KURIER_BASE}/v1/proof/status/${jobId}`, {
    headers: { Authorization: `Bearer ${KURIER_KEY}` },
  })
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
