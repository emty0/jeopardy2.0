import type { ReactNode } from 'react'

interface ConnectionGuardProps {
  ready: boolean
  message?: string
  children: ReactNode
}

export function ConnectionGuard({
  ready,
  message = 'Verbinde mit Spiel…',
  children,
}: ConnectionGuardProps) {
  if (ready) return <>{children}</>
  return (
    <div className="min-h-screen bg-bg-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <span className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
        </div>
        <p className="text-ink-300 text-sm tracking-wide">{message}</p>
      </div>
    </div>
  )
}
