'use client'

import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { generateSecret, deriveCommitment } from '@/lib/crypto'

// TODO: replace with on-chain eligibility check once contract is deployed
const ELIGIBLE_ADDRESSES: `0x${string}`[] = [
  // add eligible wallet addresses here (lowercase)
]

type Step = 'connect' | 'check' | 'generate' | 'submit' | 'backup' | 'done' | 'error'

export function RegistrationFlow() {
  const { address, isConnected } = useAccount()
  const [step, setStep] = useState<Step>('connect')
  const [secret, setSecret] = useState<`0x${string}` | null>(null)
  const [commitment, setCommitment] = useState<`0x${string}` | null>(null)
  const [leafIndex, setLeafIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function isEligible(addr: `0x${string}`): boolean {
    if (ELIGIBLE_ADDRESSES.length === 0) return true // open demo mode
    return ELIGIBLE_ADDRESSES.map(a => a.toLowerCase()).includes(addr.toLowerCase())
  }

  async function handleCheckEligibility() {
    if (!address) return
    if (!isEligible(address)) {
      setError('This wallet is not on the eligible list.')
      setStep('error')
      return
    }
    setStep('generate')
  }

  async function handleGenerateAndSubmit() {
    try {
      const newSecret = generateSecret()
      const newCommitment = deriveCommitment(newSecret)
      setSecret(newSecret)
      setCommitment(newCommitment)
      setStep('submit')

      const res = await fetch('/api/commitments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitment: newCommitment }),
      })

      if (res.status === 409) {
        setError('This commitment is already registered — did you register before?')
        setStep('error')
        return
      }
      if (!res.ok) {
        const msg = await res.text()
        throw new Error(msg)
      }

      const { index } = await res.json()
      setLeafIndex(index)
      setStep('backup')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    }
  }

  function downloadSecret() {
    if (!secret) return
    const blob = new Blob(
      [`ANON CLAIM SECRET\n\nKeep this private. You need it to claim.\n\n${secret}\n`],
      { type: 'text/plain' }
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'anon-claim-secret.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function copySecret() {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-400 text-sm">Connect your eligible wallet to begin registration. Your wallet is only used to verify eligibility — it is not your claim identity.</p>
        <ConnectButton />
      </div>
    )
  }

  if (step === 'connect') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="font-mono text-zinc-300 truncate">{address}</span>
        </div>
        <button
          onClick={handleCheckEligibility}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Check Eligibility
        </button>
      </div>
    )
  }

  if (step === 'generate') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-4 text-sm text-emerald-300">
          Wallet is eligible. Generating your identity secret and commitment — this happens entirely in your browser.
        </div>
        <button
          onClick={handleGenerateAndSubmit}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Generate Identity &amp; Register
        </button>
      </div>
    )
  }

  if (step === 'submit') {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-400">
        <Spinner />
        Submitting commitment to registry…
      </div>
    )
  }

  if (step === 'backup') {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4">
          <p className="text-amber-300 font-semibold text-sm mb-1">Save your secret now — it cannot be recovered.</p>
          <p className="text-amber-400/70 text-xs">This secret is the only way to generate your claim proof. Losing it means losing access to the claim permanently.</p>
        </div>

        <div>
          <p className="text-xs text-zinc-500 mb-1 font-mono uppercase tracking-widest">Your identity secret</p>
          <div className="font-mono text-xs break-all bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-emerald-400 select-all">
            {secret}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={downloadSecret}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Download .txt
          </button>
          <button
            onClick={copySecret}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>

        <button
          onClick={() => setStep('done')}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          I've saved my secret →
        </button>

        {leafIndex !== null && (
          <p className="text-xs text-zinc-500 font-mono">Leaf index in tree: {leafIndex}</p>
        )}
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-4 space-y-2">
        <p className="text-emerald-300 font-semibold text-sm">Registration complete.</p>
        <p className="text-zinc-400 text-xs">Your identity commitment is in the eligibility tree. When you're ready to claim, switch to the Claim tab and use your saved secret.</p>
        <p className="text-zinc-500 text-xs mt-2">Commitment: <span className="font-mono text-zinc-400 break-all">{commitment}</span></p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
        <button
          onClick={() => { setStep('connect'); setError(null) }}
          className="text-sm text-zinc-400 hover:text-zinc-200 underline"
        >
          Start over
        </button>
      </div>
    )
  }

  return null
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
