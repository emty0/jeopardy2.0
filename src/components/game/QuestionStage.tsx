import { motion, AnimatePresence } from 'framer-motion'
import type { ActiveQuestion, GamePhase, PlayerState } from '#/lib/game-state'
import { MediaCarousel } from '#/components/ui'
import { formatPoints } from '#/lib/format'

interface QuestionStageProps {
  phase: GamePhase
  question: ActiveQuestion
  buzzedPlayer: PlayerState | null
  revealedMediaIndex: number
}

export function QuestionStage({ phase, question, buzzedPlayer, revealedMediaIndex }: QuestionStageProps) {
  const showAnswer = phase === 'ANSWER_REVEALED'
  const isPreview = phase === 'QUESTION_PREVIEW'
  const questionMedia = question.mediaItems.filter(m => m.role === 'question')
  const answerMedia = question.mediaItems.filter(m => m.role === 'answer')

  return (
    <motion.div
      layoutId={`tile-${question.id}`}
      transition={{ type: 'spring', stiffness: 220, damping: 30 }}
      className="absolute inset-0 rounded-none bg-gradient-to-b from-bg-950 via-bg-900 to-bg-950 flex flex-col items-center justify-center px-12 py-8 text-center"
    >
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="inline-flex items-center gap-3 px-5 h-10 rounded-full border border-violet-500/40 bg-violet-500/10 mb-6"
      >
        <span className="font-board uppercase tracking-[0.2em] text-cyan-300 text-sm">
          {question.categoryName}
        </span>
        <span className="w-px h-4 bg-violet-500/40" />
        <span className="font-board text-cyan-400 text-xl">
          {formatPoints(question.pointValue)}
        </span>
      </motion.div>

      <div className="max-w-5xl w-full flex flex-col items-center gap-6">
        {questionMedia.length > 0 && !isPreview && !showAnswer && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="w-full"
          >
            {question.mediaPlaceholder ? (
              revealedMediaIndex < 0 ? (
                <div className="w-full max-w-3xl mx-auto rounded-2xl border border-bg-700/60 bg-bg-900 aspect-video flex items-center justify-center">
                  <p className="text-ink-400 text-2xl tracking-wide font-board uppercase">
                    Gleich wird etwas angezeigt …
                  </p>
                </div>
              ) : (
                <MediaCarousel
                  items={questionMedia.slice(0, revealedMediaIndex + 1)}
                  autoplay={question.autoplayMedia}
                />
              )
            ) : (
              <MediaCarousel items={questionMedia} autoplay={question.autoplayMedia} />
            )}
          </motion.div>
        )}

        {showAnswer && answerMedia.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="w-full"
          >
            <MediaCarousel items={answerMedia} autoplay={question.autoplayMedia} cropChrome={false} />
          </motion.div>
        )}

        {!isPreview && (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-ink-50 font-bold leading-tight max-w-[60ch]"
            style={{ fontSize: 'clamp(1.75rem, 3.5vw, 4rem)' }}
          >
            {question.questionText}
          </motion.p>
        )}

        {isPreview && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-ink-400 text-2xl tracking-wide"
          >
            Warte auf Master…
          </motion.p>
        )}

        <AnimatePresence>
          {showAnswer && (
            <motion.div
              key="answer"
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="bg-cyan-500 text-bg-950 rounded-2xl px-10 py-5 inline-block border-4 border-cyan-300 shadow-[var(--shadow-glow-cyan)]"
            >
              <p
                className="font-board uppercase tracking-wide leading-none"
                style={{ fontSize: 'clamp(2rem, 4vw, 4rem)' }}
              >
                {question.answerText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {(phase === 'BUZZING' || phase === 'JUDGING') && buzzedPlayer && (
          <motion.div
            key="buzz-banner"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="absolute bottom-12 inset-x-0 flex justify-center"
          >
            <div className="px-8 h-16 rounded-full bg-amber-500 text-bg-950 flex items-center gap-3 shadow-[var(--shadow-glow-amber)] border-2 border-amber-400">
              <span className="text-2xl">🔔</span>
              <span className="font-board uppercase tracking-wider text-3xl">
                {buzzedPlayer.displayName}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
