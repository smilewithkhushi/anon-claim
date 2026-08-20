# anon-claim

Anonymous reward claiming on Horizen blockchain using zero-knowledge proofs. Eligible wallets register a secret identity commitment, then later claim rewards from a fresh address — without revealing which registered wallet they belong to.

## How it works

### Privacy model

1. **Register** — Connect your eligible wallet. A secret is generated client-side (stays in your browser). Its Poseidon2 hash (`commitment = Poseidon2(secret)`) is submitted to a registry. Your wallet is never linked to the commitment on-chain.
2. **Claim** — From any fresh wallet, enter your saved secret and a recipient address. The browser generates a UltraHonk ZK proof locally via Barretenberg WASM, proving:
   - Your commitment is a leaf in the eligibility Merkle tree (depth 20).
   - The nullifier (`Poseidon2(secret, scope)`) is correctly derived — preventing double-claims without revealing your leaf.
   - The recipient address is bound into the proof — preventing front-running.
3. **Settle** — The proof is submitted to Kurier, which aggregates it and publishes an attestation to Horizen's zkVerify domain. The claim contract verifies the attestation on-chain and pays ETH to the recipient.

### ZK circuit

Written in Noir (`circuit/src/main.nr`), compiled to UltraHonk. Two utility circuits in `circuit-utils/` mirror the circuit's internal hash functions so the frontend can compute commitments and Merkle paths that exactly match what the prover verifies:

| Circuit | Function |
|---|---|
| `circuit-utils/hasher` | `Poseidon2([secret], 1)` — commitment derivation |
| `circuit-utils/pair` | `Poseidon2([left, right], 2)` — Merkle node hashing |
| `circuit/anon_claim` | Full proof: Merkle inclusion + nullifier + recipient binding |

## Horizen

The claim contract and zkVerify aggregation contract are deployed on **Horizen**, a L3 rollup settled on Base Sepolia that uses ETH as its native currency.

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Testnet | `2651420` | `https://horizen-testnet.rpc.caldera.xyz/http` | https://explorer-testnet.horizen.io |
| Mainnet | `26514` | `https://horizen.calderachain.xyz/http` | https://explorer.horizen.io |

**Why Horizen?** Horizen ships a native `zkVerify` infrastructure layer — an on-chain aggregation contract (`ZkVerifyAggregation` proxy at `0xCC02D0A54F3184dF4c88811E5b9FAb7ff8131e4a` on testnet) that verifiers can query to check whether a proof has been attested. This lets the `AnonClaim` settlement contract skip re-verifying the UltraHonk proof itself; it only needs to confirm that Kurier published a valid attestation for the proof leaf hash, which is dramatically cheaper on-chain.

## Kurier

[Kurier](https://kurier.xyz) is the off-chain proof aggregation service that bridges browser-generated ZK proofs into Horizen's zkVerify system.

**What it does in this project:**

1. The browser generates a UltraHonk proof (via Barretenberg WASM) for the user's claim.
2. The proof, public inputs, and verification key are posted to `/api/kurier/submit-proof` (a server-side proxy that hides the API key).
3. The proxy forwards to `POST https://api-testnet.kurier.xyz/api/v1/submit-proof/{key}` with:
   - `proofType: "ultrahonk"` + `proofOptions: { variant: "zk", version: "v0_84" }`
   - `chainId: 2651420` (Horizen testnet) — tells Kurier which chain to publish the attestation on
   - The full VK bytes inline (`vkRegistered: false`) so no separate VK registration step is required
4. Kurier aggregates the proof and publishes an attestation leaf on Horizen's zkVerify domain.
5. The frontend polls `/api/kurier/job-status/{jobId}` until the job is settled, then reads the attestation details.
6. The `AnonClaim` contract verifies the attestation via `ZkVerifyAggregation` and pays the recipient.

**Environment variables needed:**

```bash
KURIER_API_URL=https://api-testnet.kurier.xyz/api/v1
KURIER_TESTNET_API_KEY=your_kurier_key
```

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Noir** (`@noir-lang/noir_js`) + **Barretenberg** (`@aztec/bb.js`) — client-side ZK proof generation
- **wagmi** + **RainbowKit** + **viem** — wallet connection and on-chain interaction
- **Kurier** — proof aggregation and zkVerify attestation
- **Horizen L3** (chain ID 2651420 testnet / 26514 mainnet) — Caldera rollup on Base Sepolia; uses ETH as native currency

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
  TechLog           Step-by-step progress panel shown during registration and claim flows
  AnonCounter       Live on-chain count of registered commitments
lib/
  crypto.ts         generateSecret, deriveCommitment, deriveNullifier (all via Noir WASM)
  merkle.ts         Sparse incremental Merkle tree: getRoot, getMerklePath
  kurier.ts         submitProofToKurier, pollJobStatus (client-side, hits proxy routes)
  chains.ts         Horizen L3 chain definitions for viem/wagmi
scripts/
  register-vk.ts    Registers the UltraHonk VK with Kurier (optional — VK is inlined by default)
  update-merkle-root.ts  Recomputes Merkle root from commitments and calls setMerkleRoot on-chain
self/               Local dev persistence (commitments.json — not for production)
contracts/
  src/AnonClaim.sol  On-chain settlement contract
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
KURIER_API_URL=https://api-testnet.kurier.xyz/api/v1
KURIER_TESTNET_API_KEY=your_kurier_key

# Set after deploying the claim contract
NEXT_PUBLIC_CLAIM_CONTRACT=0x...
NEXT_PUBLIC_CAMPAIGN_SCOPE=0x...   # keccak256(abi.encode(contractAddress, campaignId)) — read from contract.scope()

# Optional: override default Horizen testnet RPC
NEXT_PUBLIC_HORIZEN_RPC_URL=https://horizen-testnet.rpc.caldera.xyz/http
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
- `circuit/target/vk/vk` — UltraHonk verification key (inlined into each Kurier submission)
- `circuit-utils/target/hasher.json` and `circuit-utils/target/pair_hasher.json` — used by `lib/crypto.ts` and `lib/merkle.ts`

## Scripts

```bash
# Recompute Merkle root from self/commitments.json and update it on-chain
PRIVATE_KEY=0x... pnpm update-root

# (Optional) Register VK with Kurier and print the returned vkHash + domainId
# Not required for the default flow — the VK is read from disk and inlined per-request
pnpm register-vk
# Or hit Kurier directly (without the dev server):
DIRECT=1 pnpm register-vk
```

## Deploying the claim contract

Deploy `contracts/src/AnonClaim.sol` to Horizen testnet (chain ID `2651420`). The contract hard-codes two values that must be correct at deploy time — they cannot be changed after deployment:

| Constant | Value |
|---|---|
| `ZK_VERIFY` (proxy) | `0xCC02D0A54F3184dF4c88811E5b9FAb7ff8131e4a` |
| zkVerify domain ID (passed by the frontend at claim time) | `175` |

> **Do not use `0x03225ff1ff4F1BAc6e81BB6317006A509422D51C`** — that is the implementation contract behind the proxy. Its `proofsAggregations` mapping is always empty, so `verifyProofAggregation` returns `false` silently and every `claim()` reverts.

After deployment:
1. Set `NEXT_PUBLIC_CLAIM_CONTRACT` to the new address.
2. Set `NEXT_PUBLIC_CAMPAIGN_SCOPE` — read it with `cast call $CONTRACT "scope()(bytes32)" --rpc-url $RPC`.
3. Fund the contract with `rewardAmount × eligibleCount` ETH.
4. Run `pnpm update-root` to push the current Merkle root on-chain.

## What's not wired yet

- **Merkle root update** — After registrations accumulate, run `pnpm update-root` (or call `contract.setMerkleRoot(newRoot)` directly from the owner wallet). Wire this into whatever appends to `self/commitments.json` so they can't drift.
- **Eligibility list** — `RegistrationFlow.tsx` has an empty `ELIGIBLE_ADDRESSES` array (open demo mode). Replace with an on-chain check or a signed allowlist.
- **Persistent registry** — `app/api/commitments/route.ts` writes to a local file. Replace with a database before deploying to Vercel or any serverless host.
