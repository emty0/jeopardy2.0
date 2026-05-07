import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg'
  tone?: 'ghost' | 'subtle'
  label: string
  children: ReactNode
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
}

export function IconButton({
  size = 'md',
  tone = 'ghost',
  label,
  className = '',
  children,
  ...rest
}: IconButtonProps) {
  const toneCls =
    tone === 'subtle'
      ? 'bg-bg-700 hover:bg-bg-600 text-ink-50'
      : 'bg-transparent hover:bg-bg-700 text-ink-200'
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={[
        'inline-flex items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        sizeClasses[size],
        toneCls,
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}
