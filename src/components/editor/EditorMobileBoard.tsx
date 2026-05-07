import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, Play, Plus } from 'lucide-react'
import { IconButton } from '#/components/ui'
import { formatPoints } from '#/lib/format'

interface EditorCategory {
  id: string
  name: string
}

interface EditorQuestionLite {
  questionText: string
}

interface EditorMobileBoardProps {
  categories: EditorCategory[]
  rowCount: number
  pointValues: number[]
  getQuestion: (catId: string, rowIdx: number) => EditorQuestionLite | undefined
  onOpenQuestion: (catId: string, rowIdx: number) => void
  onTestQuestion: (catId: string, rowIdx: number) => void
  onRenameCategory: (cat: EditorCategory, newName: string) => void
}

export function EditorMobileBoard({
  categories,
  rowCount,
  pointValues,
  getQuestion,
  onOpenQuestion,
  onTestQuestion,
  onRenameCategory,
}: EditorMobileBoardProps) {
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === selectedCatId) ?? null,
    [categories, selectedCatId],
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
            className="flex flex-col gap-2"
          >
            {categories.map(cat => {
              const filledCount = Array.from({ length: rowCount }, (_, i) =>
                !!getQuestion(cat.id, i)?.questionText,
              ).filter(Boolean).length
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCatId(cat.id)}
                  className="group relative w-full min-h-[64px] rounded-xl px-4 py-2.5 text-left border transition-all bg-gradient-to-br from-bg-700 to-bg-800 border-violet-500/30 hover:border-cyan-400/60 active:scale-[0.98] shadow-[var(--shadow-tile)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-board uppercase tracking-wider text-lg text-ink-50 leading-tight truncate">
                        {cat.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-widest text-ink-300 mt-0.5">
                        {filledCount} von {rowCount} befüllt
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {Array.from({ length: rowCount }, (_, i) => {
                        const isFilled = !!getQuestion(cat.id, i)?.questionText
                        return (
                          <span
                            key={i}
                            className={`w-1.5 h-5 rounded-full ${
                              isFilled ? 'bg-cyan-500/70' : 'bg-bg-600'
                            }`}
                          />
                        )
                      })}
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
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-ink-500">Kategorie</p>
                <input
                  key={selectedCategory.id}
                  defaultValue={selectedCategory.name}
                  onBlur={e => onRenameCategory(selectedCategory, e.target.value)}
                  className="bg-transparent border-b border-violet-500/30 focus:border-cyan-400 font-board uppercase tracking-wider text-xl text-cyan-300 leading-tight w-full focus:outline-none py-0.5"
                />
              </div>
            </div>

            {Array.from({ length: rowCount }, (_, rowIdx) => {
              const q_ = getQuestion(selectedCategory.id, rowIdx)
              const filled = !!q_?.questionText
              const pts = pointValues[rowIdx] ?? (rowIdx + 1) * 100
              return (
                <div key={rowIdx} className="relative">
                  <button
                    type="button"
                    onClick={() => onOpenQuestion(selectedCategory.id, rowIdx)}
                    className={[
                      'w-full min-h-[96px] rounded-2xl px-4 py-3 flex items-center gap-4 text-left',
                      'border transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                      filled
                        ? 'bg-gradient-to-r from-bg-700 to-bg-800 border-violet-500/30 shadow-[var(--shadow-tile)]'
                        : 'bg-bg-800/40 border-bg-700 hover:border-bg-600',
                    ].join(' ')}
                  >
                    <span
                      className={`font-board leading-none shrink-0 ${
                        filled ? 'text-cyan-400' : 'text-ink-500'
                      }`}
                      style={{ fontSize: 'clamp(2rem, 8vw, 2.75rem)' }}
                    >
                      {formatPoints(pts)}
                    </span>
                    <div className="min-w-0 flex-1 pr-24">
                      {filled ? (
                        <p
                          className="text-[12px] uppercase tracking-widest text-ink-200 line-clamp-2 break-words"
                          title={q_!.questionText}
                        >
                          {q_!.questionText}
                        </p>
                      ) : (
                        <p className="text-[11px] uppercase tracking-widest text-ink-500 inline-flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          Tippen zum Erstellen
                        </p>
                      )}
                    </div>
                    {filled && (
                      <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-good" />
                    )}
                  </button>
                  {filled && (
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label="Frage testen"
                      title="Frage testen"
                      onClick={e => {
                        e.stopPropagation()
                        onTestQuestion(selectedCategory.id, rowIdx)
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          onTestQuestion(selectedCategory.id, rowIdx)
                        }
                      }}
                      className="absolute bottom-3 right-3 inline-flex items-center gap-1 h-8 px-3 rounded-full bg-violet-600 hover:bg-violet-500 text-ink-50 text-[11px] font-bold uppercase tracking-wider border border-violet-400/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Testen
                    </span>
                  )}
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
