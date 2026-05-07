import type { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-none',
}

export function PageContainer({ children, size = 'md', className = '' }: PageContainerProps) {
  return (
    <div className={['mx-auto w-full px-4 sm:px-6 py-8 sm:py-10', sizeClasses[size], className].join(' ')}>
      {children}
    </div>
  )
}

interface PageHeaderProps {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  className?: string
}

export function PageHeader({ eyebrow, title, subtitle, trailing, className = '' }: PageHeaderProps) {
  return (
    <header
      className={[
        'flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8',
        className,
      ].join(' ')}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-violet-400 mb-2">
            {eyebrow}
          </p>
        )}
        <h1 className="font-board uppercase tracking-wide text-4xl sm:text-5xl text-ink-50 leading-none">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-ink-300 text-sm sm:text-base">{subtitle}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </header>
  )
}
