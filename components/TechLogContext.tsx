'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { KurierJobStatus } from '@/lib/kurier'

export type RegStep = 'connect' | 'generate' | 'submit' | 'backup' | 'done' | 'error'
export type ClaimStep = 'input' | 'generating' | 'submitting' | 'polling' | 'claiming' | 'done' | 'error'

interface TechLogCtx {
  flow: 'registration' | 'claim' | null
  regStep: RegStep | null
  prevRegStep: RegStep | null
  claimStep: ClaimStep | null
  prevClaimStep: ClaimStep | null
  kurierStatus: KurierJobStatus | null
  setFlow: (f: 'registration' | 'claim') => void
  setRegStep: (s: RegStep) => void
  setClaimStep: (s: ClaimStep) => void
  setKurierStatus: (s: KurierJobStatus | null) => void
}

const TechLogContext = createContext<TechLogCtx | null>(null)

export function TechLogProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<'registration' | 'claim' | null>(null)
  const [regStep, _setRegStep] = useState<RegStep | null>(null)
  const [prevRegStep, setPrevRegStep] = useState<RegStep | null>(null)
  const [claimStep, _setClaimStep] = useState<ClaimStep | null>(null)
  const [prevClaimStep, setPrevClaimStep] = useState<ClaimStep | null>(null)
  const [kurierStatus, setKurierStatus] = useState<KurierJobStatus | null>(null)

  const setRegStep = useCallback((s: RegStep) => {
    if (s !== 'error') setPrevRegStep(s)
    _setRegStep(s)
  }, [])

  const setClaimStep = useCallback((s: ClaimStep) => {
    if (s !== 'error') setPrevClaimStep(s)
    _setClaimStep(s)
  }, [])

  return (
    <TechLogContext.Provider value={{
      flow, regStep, prevRegStep, claimStep, prevClaimStep, kurierStatus,
      setFlow, setRegStep, setClaimStep, setKurierStatus,
    }}>
      {children}
    </TechLogContext.Provider>
  )
}

export function useTechLog() {
  const ctx = useContext(TechLogContext)
  if (!ctx) throw new Error('useTechLog must be used inside TechLogProvider')
  return ctx
}
