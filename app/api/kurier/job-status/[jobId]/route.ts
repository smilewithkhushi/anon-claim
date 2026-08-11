import { NextRequest, NextResponse } from 'next/server'

const KURIER_BASE = process.env.KURIER_API_URL ?? 'https://api-testnet.kurier.xyz/api/v1'
const KURIER_KEY = process.env.KURIER_TESTNET_API_KEY ?? ''

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  const res = await fetch(`${KURIER_BASE}/job-status/${KURIER_KEY}/${jobId}`)
  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
