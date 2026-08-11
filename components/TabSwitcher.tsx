'use client'

import { useState } from 'react'

interface Tab {
  id: string
  label: string
  content: React.ReactNode
}

export function TabSwitcher({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(tabs[0].id)
  const current = tabs.find(t => t.id === active)

  return (
    <div className="space-y-5">
      <div className="flex gap-1 bg-zinc-800/60 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              active === tab.id
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{current?.content}</div>
    </div>
  )
}
