import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'

interface BuzzerButtonProps {
  state: 'armed' | 'pressed' | 'locked' | 'disabled'
  label?: string
  hint?: string
  onPress: () => void
  buzzerSoundUrl?: string
  playSoundOnPress?: boolean
}

export function BuzzerButton({
  state,
  label = 'BUZZ!',
  hint,
  onPress,
  buzzerSoundUrl,
  playSoundOnPress = false,
}: BuzzerButtonProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (state === 'pressed' && playSoundOnPress) {
      audioRef.current?.play().catch(() => {})
    }
  }, [state, playSoundOnPress])

  const disabled = state === 'locked' || state === 'disabled'
  const armed = state === 'armed'
  const pressed = state === 'pressed'

  return (
    <div className="flex flex-col items-center gap-3">
      {buzzerSoundUrl && <audio ref={audioRef} src={buzzerSoundUrl} preload="auto" />}
      <motion.button
        type="button"
        onClick={() => !disabled && onPress()}
        disabled={disabled}
        whileTap={disabled ? undefined : { scale: 0.92 }}
        animate={
          pressed
            ? { boxShadow: '0 0 0 24px rgba(245,158,11,0)', scale: [1, 1.06, 1] }
            : undefined
        }
        transition={{ duration: pressed ? 0.45 : 0.2 }}
        className={[
          'relative w-[72vw] max-w-[20rem] aspect-square rounded-full font-black select-none',
          'border-4 transition-colors',
          'flex items-center justify-center text-center',
          armed
            ? 'bg-gradient-to-br from-violet-500 to-violet-700 text-white border-violet-300/60 buzzer-armed'
            : pressed
              ? 'bg-amber-500 text-bg-950 border-amber-300'
              : 'bg-bg-700 text-ink-500 border-bg-600 cursor-not-allowed',
        ].join(' ')}
      >
        <div className="flex flex-col items-center gap-1">
          <span
            className="font-board tracking-[0.08em] leading-none"
            style={{ fontSize: 'clamp(2rem, 8vw, 3rem)' }}
          >
            {label}
          </span>
          {hint && <span className="text-xs uppercase tracking-widest opacity-70">{hint}</span>}
        </div>
        {armed && (
          <span className="absolute inset-0 rounded-full pointer-events-none ring-2 ring-violet-300/40" />
        )}
      </motion.button>
    </div>
  )
}
