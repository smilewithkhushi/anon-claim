'use client'

import { useTechLog, type RegStep, type ClaimStep } from './TechLogContext'
import type { KurierJobStatus } from '@/lib/kurier'

type Status = 'idle' | 'active' | 'done'

interface LogEntry {
  id: string
  label: string
  desc: string
  badges: Array<{ label: string; color: string }>
  status: Status
  note?: string
}

const REG_ORDER: RegStep[] = ['connect', 'generate', 'submit', 'backup', 'done']
const CLAIM_ORDER: ClaimStep[] = ['input', 'generating', 'submitting', 'polling', 'claiming', 'done']

function rIdx(step: RegStep | null, prev: RegStep | null): number {
  const s = step === 'error' ? prev : step
  return s ? REG_ORDER.indexOf(s) : -1
}

function cIdx(step: ClaimStep | null, prev: ClaimStep | null): number {
  const s = step === 'error' ? prev : step
  return s ? CLAIM_ORDER.indexOf(s) : -1
}

function rs(i: number, doneFrom: number, activeAt?: number): Status {
  if (i < 0) return 'idle'
  if (i >= doneFrom) return 'done'
  if (activeAt !== undefined && i === activeAt) return 'active'
  return 'idle'
}

function buildRegEntries(step: RegStep | null, prev: RegStep | null): LogEntry[] {
  const i = rIdx(step, prev)
  return [
    {
      id: 'wallet',
      label: 'Wallet connected',
      desc: 'Browser wallet detected via wagmi + RainbowKit',
      badges: [{ label: 'wagmi', color: 'zinc' }, { label: 'RainbowKit', color: 'zinc' }],
      status: rs(i, 1),
    },
    {
      id: 'eligibility',
      label: 'Eligibility verified',
      desc: 'Address checked against the participant allowlist',
      badges: [{ label: 'allowlist', color: 'zinc' }],
      status: rs(i, 1),
    },
    {
      id: 'secret',
      label: 'Secret generated',
      desc: '31-byte random value via window.crypto.getRandomValues()',
      badges: [{ label: 'Browser crypto', color: 'blue' }],
      status: rs(i, 2, 1),
    },
    {
      id: 'poseidon',
      label: 'Poseidon2 hash computed',
      desc: 'H(secret) → commitment, executed in a Noir circuit locally in your browser',
      badges: [{ label: 'Noir', color: 'violet' }, { label: 'Poseidon2', color: 'indigo' }],
      status: rs(i, 3, 2),
    },
    {
      id: 'store',
      label: 'Commitment stored',
      desc: 'Leaf committed to the server-side Merkle tree',
      badges: [{ label: 'API', color: 'zinc' }, { label: 'Merkle tree', color: 'emerald' }],
      status: rs(i, 3, 2),
    },
  ]
}

const KURIER_NOTES: Record<string, string> = {
  pending: 'Job queued, waiting…',
  verifying: 'Verifying proof on zkVerify…',
  aggregating: 'Bundling with other proofs…',
  published: 'Aggregated proof published on-chain ✓',
  failed: 'Proof verification failed.',
}

function buildClaimEntries(
  step: ClaimStep | null,
  prev: ClaimStep | null,
  kurierStatus: KurierJobStatus | null,
): LogEntry[] {
  const i = cIdx(step, prev)
  const pastInput = i >= 1

  return [
    {
      id: 'fetch',
      label: 'Commitment list fetched',
      desc: 'All registered commitments loaded from the server',
      badges: [{ label: 'API', color: 'zinc' }],
      status: pastInput ? 'done' : 'idle',
    },
    {
      id: 'merkle',
      label: 'Merkle path derived',
      desc: 'Your leaf index + sibling hashes computed client-side',
      badges: [{ label: 'keccak256', color: 'blue' }, { label: 'Merkle proof', color: 'emerald' }],
      status: pastInput ? 'done' : 'idle',
    },
    {
      id: 'nullifier',
      label: 'Nullifier computed',
      desc: 'H(secret, scope) — spend tag that prevents double-claiming',
      badges: [{ label: 'Poseidon2', color: 'indigo' }, { label: 'Noir', color: 'violet' }],
      status: pastInput ? 'done' : 'idle',
    },
    {
      id: 'proof',
      label: 'UltraHonk proof generated',
      desc: 'ZK proof that you know a list secret — without revealing which one. Runs entirely in your browser.',
      badges: [{ label: 'bb.js', color: 'blue' }, { label: 'WASM', color: 'zinc' }],
      status: rs(i, 2, 1),
    },
    {
      id: 'kurier',
      label: 'Proof submitted to Kurier',
      desc: "Sent to Horizen's proof aggregation service for batched on-chain verification",
      badges: [{ label: 'Kurier', color: 'amber' }, { label: 'Horizen', color: 'teal' }],
      status: rs(i, 3, 2),
    },
    {
      id: 'zkverify',
      label: 'zkVerify aggregation',
      desc: 'Proof verified and bundled into an aggregated proof, then published to the Horizen domain',
      badges: [{ label: 'zkVerify', color: 'emerald' }, { label: 'Horizen', color: 'teal' }],
      status: rs(i, 4, 3),
      note: (step === 'polling' || (step === 'error' && prev === 'polling')) && kurierStatus
        ? KURIER_NOTES[kurierStatus]
        : undefined,
    },
    {
      id: 'claim',
      label: 'claim() on Horizen EON',
      desc: 'Smart contract verifies the aggregation proof and records your nullifier on-chain',
      badges: [{ label: 'Horizen EON', color: 'teal' }, { label: 'Solidity', color: 'zinc' }],
      status: rs(i, 5, 4),
    },
  ]
}

const BADGE_COLORS: Record<string, string> = {
  violet: 'bg-violet-900/40 border-violet-700/50 text-violet-300',
  indigo: 'bg-indigo-900/40 border-indigo-700/50 text-indigo-300',
  blue: 'bg-blue-900/40 border-blue-700/50 text-blue-300',
  amber: 'bg-amber-900/40 border-amber-700/50 text-amber-300',
  emerald: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300',
  teal: 'bg-teal-900/40 border-teal-700/50 text-teal-300',
  zinc: 'bg-zinc-800/60 border-zinc-700/50 text-zinc-400',
}

function Badge({ label, color, dim }: { label: string; color: string; dim: boolean }) {
  const cls = dim
    ? 'bg-zinc-900/40 border-zinc-800/50 text-zinc-700'
    : (BADGE_COLORS[color] ?? BADGE_COLORS.zinc)
  return (
    <span className={`inline-block text-[9px] font-mono tracking-wide uppercase px-1.5 py-0.5 rounded border ${cls}`}>
      {label}
    </span>
  )
}

function StatusDot({ status }: { status: Status }) {
  if (status === 'done') {
    return (
      <div className="w-[18px] h-[18px] rounded-full bg-emerald-900/60 border border-emerald-600/60 flex items-center justify-center shrink-0">
        <svg className="w-2.5 h-2.5 text-emerald-400" viewBox="0 0 12 12" fill="none">
          <path d="M2 6.5l2.5 2.5 5.5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    )
  }
  if (status === 'active') {
    return (
      <div className="w-[18px] h-[18px] rounded-full border border-amber-500/60 bg-amber-900/20 flex items-center justify-center shrink-0">
        <svg className="animate-spin w-3 h-3 text-amber-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    )
  }
  return (
    <div className="w-[18px] h-[18px] rounded-full border border-zinc-800 bg-zinc-900/60 shrink-0" />
  )
}

const IDLE_DIAGRAM = `Browser
  ↓ Noir + bb.js
  ↓ UltraHonk proof
Kurier (Horizen)
  ↓ aggregation job
zkVerify
  ↓ published on-chain
Horizen EON
  ↓ claim() verified
Your wallet ✓`

export function TechLog() {
  const { flow, regStep, prevRegStep, claimStep, prevClaimStep, kurierStatus } = useTechLog()

  const entries =
    flow === 'registration' ? buildRegEntries(regStep, prevRegStep) :
    flow === 'claim' ? buildClaimEntries(claimStep, prevClaimStep, kurierStatus) :
    null

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-zinc-200">Under the hood</h2>
        <p className="text-[11px] text-zinc-600 mt-0.5 font-mono">live technical trace</p>
      </div>

      {!entries ? (
        <div className="space-y-4">
          <p className="text-xs text-zinc-600 leading-relaxed">
            Start registration or claim to see every cryptographic step traced in real time.
          </p>
          <pre className="text-[10px] text-zinc-700 font-mono leading-loose select-none">{IDLE_DIAGRAM}</pre>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[8px] top-3 bottom-3 w-px bg-zinc-800/80" />
          <div className="space-y-5">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <StatusDot status={entry.status} />
                <div className="min-w-0 space-y-1.5">
                  <p className={`text-xs font-medium leading-tight ${
                    entry.status === 'done' ? 'text-zinc-300' :
                    entry.status === 'active' ? 'text-white' :
                    'text-zinc-600'
                  }`}>
                    {entry.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {entry.badges.map(b => (
                      <Badge key={b.label} label={b.label} color={b.color} dim={entry.status === 'idle'} />
                    ))}
                  </div>
                  {entry.status !== 'idle' && (
                    <p className="text-[10px] text-zinc-600 leading-relaxed">{entry.desc}</p>
                  )}
                  {entry.note && (
                    <p className="text-[10px] text-amber-400/80 font-mono">{entry.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {flow && (
        <div className="mt-5 pt-4 border-t border-zinc-800/60">
          <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-700">
            {flow === 'registration' ? '⬡ Registration flow' : '⬡ Claim flow'}
          </p>
        </div>
      )}
    </div>
  )
}
