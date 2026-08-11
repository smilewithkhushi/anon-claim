import { AnonCounter } from '@/components/AnonCounter'
import { RegistrationFlow } from '@/components/RegistrationFlow'
import { ClaimFlow } from '@/components/ClaimFlow'
import { TabSwitcher } from '@/components/TabSwitcher'

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-start min-h-screen px-4 py-16">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            Claim your reward privately
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
            You're on the list. Claim your reward to any wallet — without anyone being able to connect it back to you.
          </p>
        </div>

        {/* Counter */}
        <AnonCounter />

        {/* How privacy works */}
        <details className="group">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            How your privacy is protected
          </summary>
          <div className="mt-2 text-xs text-zinc-500 leading-relaxed space-y-1 pl-3 border-l border-zinc-800">
            <p><span className="text-zinc-300">What stays private:</span> which wallet on the list made the claim — your registration and your claim can't be linked together.</p>
            <p><span className="text-zinc-300">What's visible on-chain:</span> that a claim happened, when it happened, and which wallet received the reward.</p>
            <p><span className="text-zinc-300">Your privacy gets stronger</span> the more people register before you claim. The counter above shows how many people are in the pool.</p>
          </div>
        </details>

        {/* Main panel */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <TabSwitcher
            tabs={[
              { id: 'register', label: 'Step 1 — Register', content: <RegistrationFlow /> },
              { id: 'claim', label: 'Step 2 — Claim', content: <ClaimFlow /> },
            ]}
          />
        </div>
      </div>
    </main>
  )
}
