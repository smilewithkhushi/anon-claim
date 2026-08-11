import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// File-backed storage for local dev.
// TODO: replace with external persistent store (Neon / Vercel Blob) before shared deployment.
// Vercel serverless filesystem does not persist between invocations.
const DB_PATH = path.join(process.cwd(), 'self', 'commitments.json')

function readCommitments(): `0x${string}`[] {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function writeCommitments(commitments: `0x${string}`[]) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  fs.writeFileSync(DB_PATH, JSON.stringify(commitments, null, 2))
}

export async function GET() {
  const commitments = readCommitments()
  return NextResponse.json({ commitments, count: commitments.length })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { commitment } = body as { commitment: `0x${string}` }

  if (!commitment || !/^0x[0-9a-f]{64}$/i.test(commitment)) {
    return NextResponse.json({ error: 'Invalid commitment' }, { status: 400 })
  }

  const commitments = readCommitments()
  if (commitments.includes(commitment)) {
    return NextResponse.json({ error: 'Commitment already registered' }, { status: 409 })
  }

  commitments.push(commitment)
  writeCommitments(commitments)

  return NextResponse.json({ ok: true, index: commitments.length - 1, count: commitments.length })
}
