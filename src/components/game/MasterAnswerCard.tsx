import { motion } from 'framer-motion'
import type { ActiveQuestion } from '#/lib/game-state'
import { MediaFrame, MediaCarousel } from '#/components/ui'
import { formatPoints } from '#/lib/format'

interface MasterAnswerCardProps {
  question: ActiveQuestion
}

export function MasterAnswerCard({ question }: MasterAnswerCardProps) {
  const answerMedia = question.mediaItems.filter(m => m.role === 'answer')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="font-board uppercase tracking-[0.2em] text-cyan-400 text-xs">
          {question.categoryName}
        </span>
        <span className="w-1 h-1 rounded-full bg-bg-600" />
        <span className="font-board text-cyan-400 text-sm">
          {formatPoints(question.pointValue)}
        </span>
      </div>

      <p className="text-ink-300 text-sm leading-relaxed">{question.questionText}</p>

      {(question.youtubeUrl || question.mediaUrl) && (
        <MediaFrame
          youtubeUrl={question.youtubeUrl}
          mediaUrl={question.mediaUrl}
          mediaType={question.mediaType}
          size="sm"
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="rounded-3xl bg-gradient-to-br from-cyan-400 to-cyan-500 text-bg-950 px-5 py-6 border-2 border-cyan-300 shadow-[var(--shadow-glow-cyan)]"
      >
        <p className="text-[10px] uppercase tracking-[0.25em] text-bg-900/70 mb-2">
          Antwort (nur für dich)
        </p>
        <p
          className="font-board uppercase tracking-wide leading-tight"
          style={{ fontSize: 'clamp(1.75rem, 7vw, 2.5rem)' }}
        >
          {question.answerText}
        </p>
      </motion.div>

      {answerMedia.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] uppercase tracking-[0.25em] text-violet-300 font-bold">
            Antwort-Medien
          </p>
          <MediaCarousel items={answerMedia} autoplay={false} cropChrome={false} />
        </div>
      )}
    </div>
  )
}
