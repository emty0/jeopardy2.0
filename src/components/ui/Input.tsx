import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { forwardRef } from 'react'

const baseClasses =
  'w-full bg-bg-800 border border-bg-700 rounded-xl px-4 text-ink-50 placeholder-ink-500 transition-colors focus:outline-none focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = '', invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      className={[
        baseClasses,
        'h-11 text-sm',
        invalid ? 'border-bad/60 focus:border-bad' : '',
        className,
      ].join(' ')}
    />
  )
})

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className = '', invalid, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...rest}
      className={[
        baseClasses,
        'py-2.5 text-sm resize-none',
        invalid ? 'border-bad/60 focus:border-bad' : '',
        className,
      ].join(' ')}
    />
  )
})

interface FormFieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
  className?: string
}

export function FormField({ label, hint, error, children, className = '' }: FormFieldProps) {
  return (
    <div className={['flex flex-col gap-1.5', className].join(' ')}>
      {label && (
        <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-300">
          {label}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-ink-500">{hint}</p>}
      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  )
}
