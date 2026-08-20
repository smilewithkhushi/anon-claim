#!/usr/bin/env npx tsx
process.loadEnvFile('.env')
/**
 * Registers the UltraHonk VK with Kurier and prints the vkHash + domainId
 * to set in .env.local.
 *
 * Usage (dev server must be running on port 3000):
 *   npx tsx scripts/register-vk.ts
 *
 * Or hit Kurier directly without the dev server:
 *   DIRECT=1 npx tsx scripts/register-vk.ts
 */
import fs from 'fs'
import path from 'path'

const ROOT       = process.cwd()
const KURIER_BASE = process.env.KURIER_API_URL   ?? 'https://api-testnet.kurier.xyz/api/v1'
const KURIER_KEY  = process.env.KURIER_TESTNET_API_KEY ?? ''
const PROXY_URL   = process.env.PROXY_URL        ?? 'http://localhost:3000/api/kurier/register-vk'
const DIRECT      = Boolean(process.env.DIRECT)

async function main() {
  const vkBytes = fs.readFileSync(path.join(ROOT, 'circuit/target/vk/vk'))
  const vkHex = '0x' + vkBytes.toString('hex')

  const body = JSON.stringify({
    vk: vkHex,
    proofType: 'ultrahonk',
    proofOptions: { variant: 'zk', version: 'v0_84' },
  })

  let res: Response
  if (DIRECT) {
    if (!KURIER_KEY) {
      console.error('DIRECT=1 requires KURIER_TESTNET_API_KEY in env')
      process.exit(1)
    }
    console.log(`Registering VK directly with Kurier (${KURIER_BASE})…`)
    res = await fetch(`${KURIER_BASE}/register-vk/${KURIER_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } else {
    console.log(`Registering VK via dev-server proxy (${PROXY_URL})…`)
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  }

  const data = await res.json()
  console.log('\nKurier response:', JSON.stringify(data, null, 2))

  if (!res.ok) {
    console.error(`\nRegistration failed (HTTP ${res.status})`)
    process.exit(1)
  }

  const vkHash  = data.vkHash  ?? data.vk_hash  ?? data.hash ?? null
  const domainId = data.domainId ?? data.domain_id ?? null

  console.log('\n--- Set these in .env.local ---')
  if (vkHash)   console.log(`NEXT_PUBLIC_VK_HASH=${vkHash}`)
  if (domainId) console.log(`NEXT_PUBLIC_ZK_VERIFY_DOMAIN_ID=${domainId}`)
  if (!vkHash && !domainId) {
    console.log('(check the raw response above for the field names)')
  }
}

main().catch(err => { console.error(err); process.exit(1) })
