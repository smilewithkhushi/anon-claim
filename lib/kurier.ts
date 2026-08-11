// Kurier REST API client — all calls go through the Next.js proxy routes.
// The actual Kurier base URL and API key live server-side only.

export type KurierJobStatus =
  | 'pending'
  | 'verifying'
  | 'aggregating'
  | 'published'
  | 'failed'

export interface KurierJob {
  jobId: string
  status: KurierJobStatus
  // Fields populated once status === 'published'.
  // Field names match the zkVerify aggregation proof structure returned by Kurier.
  domainId?: number
  aggregationId?: number
  leaf?: string          // proof leaf hash — pass directly to the contract
  merklePath?: string[]  // sibling hashes
  leafCount?: number
  index?: number         // this proof's leaf index in the batch
}

export interface SubmitProofResult {
  jobId: string
}

// Client-side helpers — hit the Next.js proxy routes

export async function submitProofToKurier(payload: {
  proof: string
  publicInputs: string[]
  vkHash: string
}): Promise<SubmitProofResult> {
  const res = await fetch('/api/kurier/submit-proof', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = await res.text()
    throw new Error(`Kurier submit failed: ${msg}`)
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
    if (!res.ok) throw new Error(`Kurier poll failed: ${res.statusText}`)
    const job: KurierJob = await res.json()
    onStatus(job.status)
    if (job.status === 'published') return job
    if (job.status === 'failed') throw new Error('Kurier job failed')
    await new Promise(r => setTimeout(r, intervalMs))
  }

  throw new Error('Kurier job timed out')
}
