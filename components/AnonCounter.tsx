'use client'

import { useEffect, useState } from 'react'

export function AnonCounter() {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const res = await fetch('/api/commitments')
        const { count } = await res.json()
        if (active) setCount(count)
      } catch {}
    }
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => { active = false; clearInterval(id) }
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span>
        {count === null ? (
          <span className="text-zinc-600">loading…</span>
        ) : (
          <>
            <span className="font-mono text-zinc-100">{count}</span>
            {' '}
            <span>
              {count === 1 ? 'identity' : 'identities'} registered
            </span>
            {count < 10 && count !== null && (
              <span className="ml-2 text-amber-400 text-xs">
                — small anonymity set, consider waiting for more registrations
              </span>
            )}
          </>
        )}
      </span>
    </div>
  )
}
