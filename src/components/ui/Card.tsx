import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean
}

export function Card({ className = '', elevated = false, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={[
        'rounded-[var(--radius-card)] bg-bg-800 border border-bg-700/80',
        elevated ? 'shadow-[0_20px_40px_-20px_rgb(0_0_0_/_0.6)]' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  className?: string
}

export function CardHeader({ title, subtitle, trailing, className = '' }: CardHeaderProps) {
  return (
    <div className={['flex items-center justify-between gap-3 px-4 pt-4', className].join(' ')}>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">{title}</p>
        {subtitle && <p className="mt-0.5 text-sm text-ink-200 truncate">{subtitle}</p>}
      </div>
      {trailing}
    </div>
  )
}
