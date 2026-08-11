'use client'

import { useState } from 'react'
import { isAddress } from 'viem'
import { Noir } from '@noir-lang/noir_js'
import { UltraHonkBackend, type ProofData } from '@aztec/bb.js'
import type { CompiledCircuit } from '@noir-lang/types'
import { deriveCommitment, deriveNullifier } from '@/lib/crypto'
import { getRoot, getMerklePath } from '@/lib/merkle'
import { submitProofToKurier, pollJobStatus, type KurierJobStatus } from '@/lib/kurier'
import anonClaimCircuit from '@/circuit/target/anon_claim.json'

// TODO: replace with actual deployed contract address
const CLAIM_CONTRACT = (process.env.NEXT_PUBLIC_CLAIM_CONTRACT ?? '0x0000000000000000000000000000000000000000') as `0x${string}`
// Campaign scope — set once claim contract is deployed:
//   Hash(contractAddress || campaignId)
const SCOPE = (process.env.NEXT_PUBLIC_CAMPAIGN_SCOPE ?? '0x0000000000000000000000000000000000000000000000000000000000000001') as `0x${string}`

// VK hash registered with Kurier (set after calling /api/kurier/register-vk once)
const VK_HASH = process.env.NEXT_PUBLIC_VK_HASH ?? ''

type ClaimStep =
  | 'input'       // user enters secret + recipient
  | 'generating'  // client-side bb.js WASM proof generation (takes a few seconds)
  | 'submitting'  // sending proof to Kurier
  | 'polling'     // waiting for Kurier aggregation + zkVerify publication
  | 'claiming'    // sending on-chain claim tx
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
}): Promise<{ proof: string; publicInputs: string[] }> {
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
  // keccak:true → oracle hash is keccak256, optimized for EVM verification
  const proofData: ProofData = await getBackend().generateProof(witness, { keccak: true })

  return {
    proof: Buffer.from(proofData.proof).toString('hex'),
    publicInputs: proofData.publicInputs,
  }
}

export function ClaimFlow() {
  const [secretInput, setSecretInput] = useState('')
  const [recipient, setRecipient] = useState('')
  const [step, setStep] = useState<ClaimStep>('input')
  const [kurierStatus, setKurierStatus] = useState<KurierJobStatus | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        throw new Error('Your commitment is not in the registry. Did you complete registration?')
      }

      const root = await getRoot(commitments)
      const { siblings, pathIndices } = await getMerklePath(commitments, leafIndex)
      const nullifier = await deriveNullifier(secretHex, SCOPE)

      // 2. Generate UltraHonk proof client-side in the browser (WASM)
      setStep('generating')
      const { proof, publicInputs } = await generateProof({
        secret: secretHex,
        siblings,
        pathIndices,
        root,
        nullifier,
        scope: SCOPE,
        recipient: recipientHex,
      })

      // 3. Submit proof to Kurier via proxy
      setStep('submitting')
      const { jobId } = await submitProofToKurier({ proof, publicInputs, vkHash: VK_HASH })

      // 4. Poll until aggregated and published to Horizen's zkVerify domain
      setStep('polling')
      const job = await pollJobStatus(jobId, (s) => setKurierStatus(s))

      // 5. Call claim contract on Horizen
      setStep('claiming')
      // TODO: wire wagmi's writeContract once CLAIM_CONTRACT address + ABI are known
      // const { hash } = await writeContract(wagmiConfig, {
      //   address: CLAIM_CONTRACT,
      //   abi: claimAbi,
      //   functionName: 'claim',
      //   args: [nullifier, root, recipient, job.attestationId, job.merkleProof],
      //   chain: horizenTestnet,
      // })
      // setTxHash(hash)
      throw new Error('On-chain claim not yet wired — deploy the claim contract first.')

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('error')
    }
  }

  if (step === 'input') {
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Your identity secret
          </label>
          <textarea
            value={secretInput}
            onChange={e => setSecretInput(e.target.value)}
            placeholder="0x..."
            rows={2}
            className="w-full font-mono text-xs bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
          />
          {secretInput && !secretValid && (
            <p className="text-red-400 text-xs mt-1">Invalid secret format — should be 0x followed by 62 hex characters.</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-widest text-zinc-500 mb-1">
            Recipient address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="0x..."
            className="w-full font-mono text-xs bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <p className="text-amber-400/80 text-xs mt-1">
            Use a fresh wallet as recipient — not the wallet you used to register. Using the same wallet defeats the privacy model.
          </p>
          {recipient && !recipientValid && (
            <p className="text-red-400 text-xs mt-1">Invalid Ethereum address.</p>
          )}
        </div>

        <button
          onClick={handleClaim}
          disabled={!secretValid || !recipientValid}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed"
        >
          Generate Proof &amp; Claim
        </button>
      </div>
    )
  }

  if (step === 'generating') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <Spinner />
          <span>Generating zero-knowledge proof…</span>
        </div>
        <p className="text-xs text-zinc-500">
          Your browser is running the Barretenberg prover locally. This takes a few seconds. No data leaves your device during this step.
        </p>
      </div>
    )
  }

  if (step === 'submitting') {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-300">
        <Spinner />
        Submitting proof to Kurier…
      </div>
    )
  }

  if (step === 'polling') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-sm text-zinc-300">
          <Spinner />
          <span>Waiting for on-chain settlement…</span>
        </div>
        <p className="text-xs text-zinc-500">
          Kurier is aggregating your proof with others and publishing to Horizen's zkVerify domain. This is a separate step from proof generation and can take up to a few minutes.
        </p>
        {kurierStatus && (
          <p className="text-xs font-mono text-zinc-400">
            Status: <span className="text-emerald-400">{kurierStatus}</span>
          </p>
        )}
      </div>
    )
  }

  if (step === 'claiming') {
    return (
      <div className="flex items-center gap-3 text-sm text-zinc-300">
        <Spinner />
        Submitting on-chain claim transaction…
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="rounded-lg border border-emerald-700/40 bg-emerald-950/30 p-4 space-y-2">
        <p className="text-emerald-300 font-semibold text-sm">Claim successful.</p>
        <p className="text-zinc-400 text-xs">Your reward has been sent to the recipient address. The nullifier is now spent — this identity cannot claim again.</p>
        {txHash && (
          <p className="text-xs font-mono text-zinc-500 break-all">Tx: {txHash}</p>
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
          onClick={() => { setStep('input'); setError(null); setKurierStatus(null) }}
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
