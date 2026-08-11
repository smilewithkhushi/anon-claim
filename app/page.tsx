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
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-widest text-zinc-500">Horizen · zkVerify · Kurier</span>
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
            Anonymous Claim
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed max-w-sm">
            Prove you belong to an eligible set and claim a reward — without revealing which member you are.
          </p>
        </div>

        {/* Anonymity set counter */}
        <AnonCounter />

        {/* Privacy model note */}
        <details className="group">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            What this actually hides (and what it doesn't)
          </summary>
          <div className="mt-2 text-xs text-zinc-500 leading-relaxed space-y-1 pl-3 border-l border-zinc-800">
            <p><span className="text-zinc-300">Hides:</span> which registered identity submitted the claim — the claim transaction cannot be linked back to the registration transaction.</p>
            <p><span className="text-zinc-300">Does not hide:</span> that a claim happened, when it happened, or the wallet that received the reward.</p>
            <p><span className="text-zinc-300">Anonymity set:</span> your real-world privacy depends on how many identities have registered before you claim. The counter above shows the current size.</p>
          </div>
        </details>

        {/* Main panel */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <TabSwitcher
            tabs={[
              { id: 'register', label: 'Register', content: <RegistrationFlow /> },
              { id: 'claim', label: 'Claim', content: <ClaimFlow /> },
            ]}
          />
        </div>
      </div>
    </main>
  )
}
