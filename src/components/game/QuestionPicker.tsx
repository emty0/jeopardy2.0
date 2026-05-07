import { motion, AnimatePresence } from 'framer-motion'
import { useState, useMemo } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import type { BoardCategory } from '#/lib/game-state'
import { formatPoints } from '#/lib/format'
import { IconButton } from '#/components/ui'

interface QuestionPickerProps {
  board: BoardCategory[]
  onPick: (questionId: string) => void
  readOnly?: boolean
}

export function QuestionPicker({ board, onPick, readOnly = false }: QuestionPickerProps) {
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const selectedCategory = useMemo(
    () => board.find(c => c.id === selectedCatId) ?? null,
    [board, selectedCatId],
  )

  return (
    <div className="relative w-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {!selectedCategory ? (
          <motion.div
            key="step-cats"
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="flex flex-col gap-3"
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-ink-500 px-1">
              {readOnly ? 'Board' : 'Wähle eine Kategorie'}
            </p>
            {board.map(cat => {
              const open = cat.questions.filter(q => !q.answered).length
              const total = cat.questions.length
              const exhausted = open === 0
              const disabled = readOnly || exhausted
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => !disabled && setSelectedCatId(cat.id)}
                  disabled={disabled}
                  className={[
                    'group relative w-full min-h-[88px] rounded-2xl px-5 py-4 text-left',
                    'border transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                    disabled
                      ? 'bg-bg-800/40 border-bg-700/40 opacity-50 cursor-not-allowed'
                      : 'bg-gradient-to-br from-bg-700 to-bg-800 border-violet-500/30 hover:border-cyan-400/60 active:scale-[0.98] shadow-[var(--shadow-tile)]',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-board uppercase tracking-wider text-2xl text-ink-50 leading-tight truncate">
                        {cat.name}
                      </p>
                      <p className="text-[11px] uppercase tracking-widest text-ink-300 mt-1">
                        {exhausted ? 'Alles beantwortet' : `${open} von ${total} offen`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {cat.questions.map(q => (
                        <span
                          key={q.id}
                          className={`w-1.5 h-6 rounded-full ${
                            q.answered ? 'bg-bg-600' : 'bg-cyan-500/70'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
          </motion.div>
        ) : (
          <motion.div
            key={`step-pts-${selectedCategory.id}`}
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2 px-1 mb-1">
              <IconButton
                label="Zurück zu Kategorien"
                size="sm"
                tone="subtle"
                onClick={() => setSelectedCatId(null)}
              >
                <ChevronLeft className="w-4 h-4" />
              </IconButton>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-ink-500">Kategorie</p>
                <p className="font-board uppercase tracking-wider text-xl text-cyan-300 leading-tight truncate">
                  {selectedCategory.name}
                </p>
              </div>
            </div>

            {selectedCategory.questions.map(q => {
              const disabled = readOnly || q.answered
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => !disabled && onPick(q.id)}
                  disabled={disabled}
                  className={[
                    'w-full h-16 rounded-2xl px-5 flex items-center justify-between',
                    'border transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                    disabled
                      ? 'bg-bg-800/40 border-bg-700/40 text-ink-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-bg-700 to-bg-800 border-violet-500/30 hover:border-cyan-400/60 active:scale-[0.98] shadow-[var(--shadow-tile)]',
                  ].join(' ')}
                >
                  <span
                    className={`font-board leading-none ${
                      disabled ? 'text-ink-500' : 'text-cyan-400'
                    }`}
                    style={{ fontSize: 'clamp(1.5rem, 6vw, 2.25rem)' }}
                  >
                    {formatPoints(q.pointValue)}
                  </span>
                  {q.answered ? (
                    <span className="text-[11px] uppercase tracking-widest text-ink-500 inline-flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" />
                      gespielt
                    </span>
                  ) : (
                    <span className="text-[11px] uppercase tracking-widest text-ink-300">
                      Tippen zum Wählen
                    </span>
                  )}
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
