import type { HTMLAttributes, ReactNode } from 'react'

export type PillTone = 'neutral' | 'violet' | 'cyan' | 'amber' | 'good' | 'bad' | 'outline'

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone
  leading?: ReactNode
  size?: 'sm' | 'md'
}

const toneClasses: Record<PillTone, string> = {
  neutral: 'bg-bg-700 text-ink-200 border border-bg-600/60',
  violet: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  good: 'bg-good/15 text-good border border-good/30',
  bad: 'bg-bad/15 text-bad border border-bad/30',
  outline: 'bg-transparent text-ink-300 border border-bg-600',
}

export function Pill({
  tone = 'neutral',
  leading,
  size = 'sm',
  className = '',
  children,
  ...rest
}: PillProps) {
  const sizeCls = size === 'sm' ? 'h-6 px-2.5 text-[11px]' : 'h-8 px-3 text-xs'
  return (
    <span
      {...rest}
      className={[
        'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-semibold tracking-wide whitespace-nowrap',
        toneClasses[tone],
        sizeCls,
        className,
      ].join(' ')}
    >
      {leading}
      {children}
    </span>
  )
}
