import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'accent' | 'danger' | 'success' | 'ghost' | 'subtle'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  leading?: ReactNode
  trailing?: ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-violet-500 hover:bg-violet-400 active:bg-violet-600 text-white border border-violet-400/30 shadow-[var(--shadow-glow-violet)]',
  accent:
    'bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-500 text-bg-950 border border-cyan-300/40',
  danger:
    'bg-bad hover:brightness-110 active:brightness-95 text-white border border-white/10',
  success:
    'bg-good hover:brightness-110 active:brightness-95 text-white border border-white/10',
  ghost:
    'bg-transparent hover:bg-bg-700 text-ink-200 border border-transparent',
  subtle:
    'bg-bg-700 hover:bg-bg-600 active:bg-bg-700 text-ink-50 border border-bg-600/50',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2',
  xl: 'h-16 px-8 text-lg rounded-2xl gap-3',
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leading,
  trailing,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center font-bold tracking-wide select-none transition-all duration-150',
        'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
    >
      {leading}
      {children}
      {trailing}
    </button>
  )
}
