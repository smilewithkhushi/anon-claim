# anon-claim

Anonymous reward claiming on Horizen using zero-knowledge proofs. Eligible wallets register a secret identity commitment, then later claim rewards from a fresh address — without revealing which registered wallet they belong to.

## How it works

### Privacy model

1. **Register** — Connect your eligible wallet. A secret is generated client-side (stays in your browser). Its Poseidon2 hash (`commitment = Poseidon2(secret)`) is submitted to a registry. Your wallet is never linked to the commitment on-chain.
2. **Claim** — From any fresh wallet, enter your saved secret and a recipient address. The browser generates a UltraHonk ZK proof locally via Barretenberg WASM, proving:
   - Your commitment is a leaf in the eligibility Merkle tree (depth 20).
   - The nullifier (`Poseidon2(secret, scope)`) is correctly derived — preventing double-claims without revealing your leaf.
   - The recipient address is bound into the proof — preventing front-running.
3. **Settle** — The proof is submitted to Kurier, which aggregates it and publishes an attestation to Horizen's zkVerify domain. The claim contract then verifies the attestation on-chain.

### ZK circuit

Written in Noir (`circuit/src/main.nr`), compiled to UltraHonk. Two utility circuits in `circuit-utils/` mirror the circuit's internal hash functions so the frontend can compute commitments and Merkle paths that exactly match what the prover verifies:

| Circuit | Function |
|---|---|
| `circuit-utils/hasher` | `Poseidon2([secret], 1)` — commitment derivation |
| `circuit-utils/pair` | `Poseidon2([left, right], 2)` — Merkle node hashing |
| `circuit/anon_claim` | Full proof: Merkle inclusion + nullifier + recipient binding |

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Noir** (`@noir-lang/noir_js`) + **Barretenberg** (`@aztec/bb.js`) — client-side ZK proof generation
- **wagmi** + **RainbowKit** + **viem** — wallet connection and on-chain interaction
- **Kurier** — proof aggregation and zkVerify attestation
- **Horizen Testnet** (chain ID 2651420) — target settlement chain

## Project structure

```
circuit/            Noir circuit (anon_claim) — the main ZK program
circuit-utils/      Two helper circuits (hasher, pair) used by the frontend
  hasher/           Poseidon2([secret], 1)
  pair/             Poseidon2([left, right], 2)
app/
  api/
    commitments/    GET/POST commitment registry (file-backed for local dev)
    kurier/         Server-side proxy to Kurier API (hides API key)
components/
  RegistrationFlow  Wallet connect → eligibility check → secret generation → commitment submission
  ClaimFlow         Secret input → Merkle path lookup → proof generation → Kurier → on-chain claim
lib/
  crypto.ts         generateSecret, deriveCommitment, deriveNullifier (all via Noir WASM)
  merkle.ts         Sparse incremental Merkle tree: getRoot, getMerklePath
  kurier.ts         submitProofToKurier, pollJobStatus (client-side, hits proxy routes)
  chains.ts         Horizen Testnet chain definition for viem/wagmi
self/               Local dev persistence (commitments.json — not for production)
```

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 10+
- Nargo (Noir toolchain) — only needed to recompile the circuit

### Install

```bash
pnpm install
```

### Environment variables

Create a `.env.local`:

```bash
# Kurier — proof aggregation service
KURIER_API_URL=https://api-testnet.kurier.dev
KURIER_API_KEY=your_kurier_key

# Set after deploying the claim contract
NEXT_PUBLIC_CLAIM_CONTRACT=0x...
NEXT_PUBLIC_CAMPAIGN_SCOPE=0x...   # Hash(contractAddress || campaignId)

# Set after registering the VK with Kurier (/api/kurier/register-vk)
NEXT_PUBLIC_VK_HASH=0x...

# Optional: override default Horizen testnet RPC
NEXT_PUBLIC_HORIZEN_RPC_URL=https://rpc-testnet.horizen.io
```

### Run locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The commitment registry is backed by `self/commitments.json` for local development. This file is not suitable for shared or production deployments — replace the `GET`/`POST` handlers in `app/api/commitments/route.ts` with a persistent store (e.g. Neon, Vercel Blob).

## Compiling the circuit

The compiled artifacts are not committed — run these before starting the dev server:

```bash
cd circuit && nargo compile && nargo prove --oracle-resolver=keccak && cd ..
cd circuit-utils/hasher && nargo compile && cd ../..
cd circuit-utils/pair   && nargo compile && cd ../..
```

This produces:
- `circuit/target/anon_claim.json` — ACIR bytecode loaded by the frontend prover
- `circuit/target/vk/vk` — UltraHonk verification key (needed for Kurier VK registration)
- `circuit-utils/target/hasher.json` and `circuit-utils/target/pair_hasher.json` — used by `lib/crypto.ts` and `lib/merkle.ts`

## What's not wired yet

- **Deploy the claim contract** — `contracts/src/AnonClaim.sol` is ready. Deploy to Horizen testnet, then set `NEXT_PUBLIC_CLAIM_CONTRACT`, `NEXT_PUBLIC_CAMPAIGN_SCOPE` (read from `contract.scope()`), and fund the contract with `rewardAmount × eligibleCount` ZEN.
- **VK registration** — Call `/api/kurier/register-vk` once after compiling the circuit to get `NEXT_PUBLIC_VK_HASH`. Pass the path to `circuit/target/vk/vk`.
- **Merkle root update** — After registrations accumulate, call `contract.setMerkleRoot(newRoot)` from the owner wallet and update `NEXT_PUBLIC_MERKLE_ROOT` in `.env.local`.
- **Eligibility list** — `RegistrationFlow.tsx` has an empty `ELIGIBLE_ADDRESSES` array (open demo mode). Replace with an on-chain check or a signed allowlist.
- **Persistent registry** — `app/api/commitments/route.ts` writes to a local file. Replace with a database before deploying to Vercel or any serverless host.
- **zkVerify interface** — `contracts/src/interfaces/IZkVerify.sol` and the leaf-hash encoding in `AnonClaim._proofLeaf()` must be verified against the deployed Horizen zkVerify contract ABI before going live.
