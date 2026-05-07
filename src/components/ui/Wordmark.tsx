interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-4xl sm:text-5xl',
  xl: 'text-5xl sm:text-7xl',
}

export function Wordmark({ size = 'md', className = '' }: WordmarkProps) {
  return (
    <span
      className={[
        'font-board uppercase tracking-[0.18em] leading-none bg-gradient-to-r from-violet-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent',
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      Jeopardy 2.0
    </span>
  )
}
