'use client'

import { useState, useEffect } from 'react'
import { isAddress, type Hex } from 'viem'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { Noir } from '@noir-lang/noir_js'
import { UltraHonkBackend, type ProofData } from '@aztec/bb.js'
import type { CompiledCircuit } from '@noir-lang/types'
import { deriveCommitment, deriveNullifier } from '@/lib/crypto'
import { getRoot, getMerklePath } from '@/lib/merkle'
import { submitProofToKurier, pollJobStatus, type KurierJobStatus, type KurierJob } from '@/lib/kurier'
import { useTechLog } from './TechLogContext'
import { horizenTestnet } from '@/lib/chains'
import { anonClaimAbi } from '@/lib/abi'
import anonClaimCircuit from '@/circuit/target/anon_claim.json'

const CLAIM_CONTRACT = (process.env.NEXT_PUBLIC_CLAIM_CONTRACT ?? '0x0000000000000000000000000000000000000000') as `0x${string}`

// BN254 scalar field modulus — scope must be reduced to a valid field element before being
// passed to the circuit, since keccak256-derived scopes can exceed the modulus.
const _BN254_FR = BigInt('0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001')
const _scopeRaw = process.env.NEXT_PUBLIC_CAMPAIGN_SCOPE ?? '0x0000000000000000000000000000000000000000000000000000000000000001'
const SCOPE = ('0x' + (BigInt(_scopeRaw) % _BN254_FR).toString(16).padStart(64, '0')) as `0x${string}`
// domainId for the ZkVerifyAggregation contract on Horizen testnet.
// Verify against AggregationPosted events after first successful proof submission.
const ZK_VERIFY_DOMAIN_ID = BigInt(process.env.NEXT_PUBLIC_ZK_VERIFY_DOMAIN_ID ?? '2651420')

// Step type matches ClaimStep exported from TechLogContext
type ClaimStep =
  | 'input'
  | 'generating'
  | 'submitting'
  | 'polling'
  | 'claiming'
  | 'done'
  | 'error'

// Singletons — initialized lazily to avoid loading WASM at page load
let _backend: UltraHonkBackend | null = null
let _noir: Noir | null = null

function getBackend(): UltraHonkBackend {
  if (!_backend) _backend = new UltraHonkBackend(anonClaimCircuit.bytecode)
  return _backend
}

function getNoir(): Noir {
  if (!_noir) _noir = new Noir(anonClaimCircuit as unknown as CompiledCircuit)
  return _noir
}

async function generateProof(inputs: {
  secret: `0x${string}`
  siblings: `0x${string}`[]
  pathIndices: number[]
  root: `0x${string}`
  nullifier: `0x${string}`
  scope: `0x${string}`
  recipient: `0x${string}`
}): Promise<{ proof: string; publicInputs: string[]; vk: string }> {
  // 1. Execute circuit to generate witness (pure JS, fast)
  const { witness } = await getNoir().execute({
    secret: inputs.secret,
    path_indices: inputs.pathIndices.map(i => i.toString()),
    siblings: inputs.siblings,
    root: inputs.root,
    nullifier: inputs.nullifier,
    scope: inputs.scope,
    recipient: inputs.recipient,
  })

  // 2. Generate UltraHonk proof from witness (WASM, takes a few seconds)
  // keccak: true — Kurier's Legacy.ZK format (the only accepted variant for ultrahonk)
  // requires keccak-oracle transcript. VK is also generated with --oracle_hash keccak.
  const proofData: ProofData = await getBackend().generateProof(witness, { keccak: true })

  // 3. Verify proof locally before sending to Kurier (fast, ~0.1s).
  // If this fails the proof is invalid — circuit/witness bug, not a Kurier issue.
  const isValid = await getBackend().verifyProof(proofData, { keccak: true })
  if (!isValid) throw new Error('Proof failed local verification. The circuit witness may be inconsistent.')

  // 4. Fetch the VK bytes that bb.js uses internally. Sending these to Kurier
  // ensures byte-perfect consistency — no CLI-vs-WASM divergence possible.
  const vkBytes: Uint8Array = await getBackend().getVerificationKey({ keccak: true })

  return {
    proof: '0x' + Buffer.from(proofData.proof).toString('hex'),
    publicInputs: proofData.publicInputs,
    vk: '0x' + Buffer.from(vkBytes).toString('hex'),
  }
}

export function ClaimFlow() {
  const [secretInput, setSecretInput] = useState('')
  const [recipient, setRecipient] = useState('')
  const [step, setStep] = useState<ClaimStep>('input')
  const [kurierStatus, setKurierStatus] = useState<KurierJobStatus | null>(null)
  const [txHash, setTxHash] = useState<Hex | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { writeContractAsync } = useWriteContract()

  const { setFlow, setClaimStep, setKurierStatus: setCtxKurierStatus } = useTechLog()

  useEffect(() => {
    setFlow('claim')
    setClaimStep('input')
  }, [setFlow, setClaimStep])

  function updateStep(s: ClaimStep) {
    setStep(s)
    setClaimStep(s)
  }

  function updateKurierStatus(s: KurierJobStatus) {
    setKurierStatus(s)
    setCtxKurierStatus(s)
  }

  const secretHex = secretInput.trim() as `0x${string}`
  const recipientHex = recipient.trim() as `0x${string}`
  const secretValid = /^0x[0-9a-f]{62}$/i.test(secretHex)
  const recipientValid = isAddress(recipientHex)

  async function handleClaim() {
    if (!secretValid || !recipientValid) return
    setError(null)

    try {
      // 1. Fetch current commitment list and build tree
      const res = await fetch('/api/commitments')
      const { commitments } = await res.json() as { commitments: `0x${string}`[] }

      const commitment = await deriveCommitment(secretHex)
      const leafIndex = commitments.indexOf(commitment)
      if (leafIndex === -1) {
        throw new Error("This claim code isn't recognized. Did you complete Step 1 — Register first?")
      }

      const root = await getRoot(commitments)
      const { siblings, pathIndices } = await getMerklePath(commitments, leafIndex)
      const nullifier = await deriveNullifier(secretHex, SCOPE)

      // 2. Generate UltraHonk proof client-side in the browser (WASM)
      updateStep('generating')
      const { proof, publicInputs, vk } = await generateProof({
        secret: secretHex,
        siblings,
        pathIndices,
        root,
        nullifier,
        scope: SCOPE,
        recipient: recipientHex,
      })

      // 3. Submit proof to Kurier via proxy
      updateStep('submitting')
      const { jobId } = await submitProofToKurier({ proof, publicInputs, vk })

      // 4. Poll until aggregated and published to Horizen's zkVerify domain
      updateStep('polling')
      const job: KurierJob = await pollJobStatus(jobId, updateKurierStatus)

      if (
        job.aggregationId == null ||
        !job.leaf || !job.merklePath || job.leafCount == null || job.index == null
      ) {
        throw new Error('Verification completed but returned incomplete data. Try again.')
      }

      // 5. Call claim contract on Horizen testnet
      updateStep('claiming')
      const hash = await writeContractAsync({
        address: CLAIM_CONTRACT,
        abi: anonClaimAbi,
        functionName: 'claim',
        args: [
          nullifier as Hex,
          root as Hex,
          recipientHex,
          job.domainId != null ? BigInt(job.domainId) : ZK_VERIFY_DOMAIN_ID,
          BigInt(job.aggregationId),
          job.leaf as Hex,
          job.merklePath as Hex[],
          BigInt(job.leafCount),
          BigInt(job.index),
        ],
        chain: horizenTestnet,
      })
      setTxHash(hash)
      updateStep('done')

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      updateStep('error')
    }
  }

  if (step === 'input') {
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Your claim code
          </label>
          <textarea
            value={secretInput}
            onChange={e => setSecretInput(e.target.value)}
            placeholder="0x..."
            rows={2}
            className="w-full font-mono text-xs bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
          />
          {secretInput && !secretValid && (
            <p className="text-red-400 text-xs mt-1">That doesn't look right — paste the full code you saved during registration.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Where should we send the reward?
          </label>
          <input
            type="text"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full font-mono text-xs bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <p className="text-amber-400/80 text-xs mt-1">
            Use a different wallet than the one you registered with — sending to the same wallet links your identity and breaks your privacy.
          </p>
          {recipient && !recipientValid && (
            <p className="text-red-400 text-xs mt-1">Enter a valid wallet address starting with 0x.</p>
          )}
        </div>

        <button
          onClick={handleClaim}
          disabled={!secretValid || !recipientValid}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
        >
          Collect my reward
        </button>
      </div>
    )
  }

  if (step === 'generating') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <Spinner />
          <span>Creating your private proof…</span>
        </div>
        <p className="text-xs text-zinc-500">
          Your device is verifying that you're on the list — without revealing which wallet you are. This takes a few seconds and nothing leaves your browser.
        </p>
      </div>
    )
  }

  if (step === 'submitting') {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-300">
        <Spinner />
        Sending your proof for verification…
      </div>
    )
  }

  if (step === 'polling') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <Spinner />
          <span>Waiting for on-chain confirmation…</span>
        </div>
        <p className="text-xs text-zinc-500">
          Your proof is being verified and recorded on-chain. This can take a couple of minutes — don't close this tab.
        </p>
        {kurierStatus && kurierStatus !== 'pending' && (
          <p className="text-xs text-zinc-500">
            {kurierStatus === 'verifying' && 'Checking your proof…'}
            {kurierStatus === 'aggregating' && 'Bundling with other claims…'}
            {kurierStatus === 'published' && 'Confirmed on-chain ✓'}
          </p>
        )}
      </div>
    )
  }

  if (step === 'claiming') {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-300">
        <Spinner />
        Sending your reward…
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-4 space-y-2">
        <p className="text-emerald-300 font-semibold text-sm">Reward sent!</p>
        <p className="text-zinc-400 text-xs">Your reward is on its way to the wallet you specified. This claim code has been used and can't be used again.</p>
        {txHash && (
          <p className="text-xs font-mono text-zinc-500 break-all">Transaction: {txHash}</p>
        )}
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
          onClick={() => { updateStep('input'); setError(null); setKurierStatus(null); setCtxKurierStatus(null) }}
          className="text-sm text-zinc-400 hover:text-zinc-200 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return null
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
