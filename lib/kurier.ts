// Kurier REST API client — all calls go through the Next.js proxy routes.
// The actual Kurier base URL and API key live server-side only.

export type KurierJobStatus =
  | 'pending'
  | 'verifying'
  | 'aggregating'
  | 'published'
  | 'failed'

// Raw shape returned by GET /job-status/:apiKey/:jobId
interface KurierJobRaw {
  jobId: string
  status: string
  reason?: string        // present when status === 'failed'
  message?: string       // alternative error field name
  domainId?: number
  aggregationId?: number
  aggregationDetails?: {
    domainId?: number
    leaf?: string
    merkleProof?: string[]
    numberOfLeaves?: number
    leafIndex?: number
  }
}

// Normalised shape used by ClaimFlow
export interface KurierJob {
  jobId: string
  status: KurierJobStatus
  reason?: string        // failure reason surfaced from Kurier
  // Populated once status === 'Aggregated'
  domainId?: number
  aggregationId?: number
  leaf?: string
  merklePath?: string[]
  leafCount?: number
  index?: number
}

export interface SubmitProofResult {
  jobId: string
}

function normaliseStatus(raw: string): KurierJobStatus {
  const s = raw.toLowerCase()
  if (s === 'aggregated' || s === 'finalized') return 'published'
  if (s === 'failed') return 'failed'
  if (s === 'valid' || s === 'includedinblock') return 'verifying'
  return 'pending'
}

function normalise(raw: KurierJobRaw): KurierJob {
  const ad = raw.aggregationDetails
  return {
    jobId: raw.jobId,
    status: normaliseStatus(raw.status),
    reason: raw.reason ?? raw.message,
    domainId: raw.domainId ?? ad?.domainId,
    aggregationId: raw.aggregationId,
    leaf: ad?.leaf,
    merklePath: ad?.merkleProof,
    leafCount: ad?.numberOfLeaves,
    index: ad?.leafIndex,
  }
}

// Client-side helpers — hit the Next.js proxy routes

export async function submitProofToKurier(payload: {
  proof: string
  publicInputs: string[]
  vk?: string
}): Promise<SubmitProofResult> {
  const res = await fetch('/api/kurier/submit-proof', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Failed to submit your proof for verification. ${msg}`)
  }
  return res.json()
}

export async function pollJobStatus(
  jobId: string,
  onStatus: (status: KurierJobStatus) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {}
): Promise<KurierJob> {
  const { intervalMs = 3000, timeoutMs = 300_000 } = opts
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(`/api/kurier/job-status/${jobId}`)
    if (!res.ok) throw new Error('Lost connection while waiting for verification. Try again.')
    const raw: KurierJobRaw = await res.json()
    const job = normalise(raw)
    onStatus(job.status)
    if (job.status === 'published') return job
    if (job.status === 'failed') {
      const detail = job.reason ? ` Reason: ${job.reason}` : ''
      throw new Error(`Proof verification failed.${detail} Try again.`)
    }
    await new Promise(r => setTimeout(r, intervalMs))
  }

  throw new Error('Verification is taking too long. Try again in a few minutes.')
}
