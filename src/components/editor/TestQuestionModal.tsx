import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, RotateCcw, Eye, Tv, Gamepad2, Smartphone } from 'lucide-react'
import type { ActiveQuestion, GamePhase, PlayerState, MediaItem } from '#/lib/game-state'
import { QuestionStage, MasterAnswerCard, JudgeBar, BuzzerButton, PhaseBadge } from '#/components/game'
import { Pill, MediaCarousel, Card, IconButton, Button } from '#/components/ui'
import { formatPoints } from '#/lib/format'

interface TestQuestionModalProps {
  open: boolean
  onClose: () => void
  question: ActiveQuestion
  rewardOnCorrect: number
  basePenalty: number
}

const TEST_PLAYER: PlayerState = {
  id: 'test-player',
  displayName: 'Testspieler',
  score: 0,
  isConnected: true,
  userId: null,
  color: '#7C3AED',
}

type Mode = 'all' | 'tv' | 'master' | 'player'

export function TestQuestionModal({
  open,
  onClose,
  question,
  rewardOnCorrect,
  basePenalty,
}: TestQuestionModalProps) {
  const questionMedia = question.mediaItems.filter(m => m.role === 'question')
  const answerMedia = question.mediaItems.filter(m => m.role === 'answer')
  const [phase, setPhase] = useState<GamePhase>('QUESTION_OPEN')
  const [buzzed, setBuzzed] = useState(false)
  const [revealedMediaIndex, setRevealedMediaIndex] = useState(
    question.mediaPlaceholder ? -1 : Math.max(0, questionMedia.length - 1),
  )
  const [noPenalty, setNoPenalty] = useState(false)
  const [score, setScore] = useState(0)
  const [solvedThisQuestion, setSolvedThisQuestion] = useState(false)
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'tv' : 'all',
  )

  function reset() {
    setPhase('QUESTION_OPEN')
    setBuzzed(false)
    setRevealedMediaIndex(question.mediaPlaceholder ? -1 : Math.max(0, questionMedia.length - 1))
    setNoPenalty(false)
    setScore(0)
    setSolvedThisQuestion(false)
  }

  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question.id])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const penalty = noPenalty ? 0 : basePenalty
  const buzzedPlayer = buzzed ? TEST_PLAYER : null
  const canRevealMore =
    (question.showMediaOnPlayer || question.mediaPlaceholder) &&
    questionMedia.length > 0 &&
    revealedMediaIndex < questionMedia.length - 1

  function handleBuzz() {
    if (phase !== 'QUESTION_OPEN') return
    setBuzzed(true)
    setPhase('JUDGING')
  }

  function handleJudgeCorrect() {
    setScore(s => s + rewardOnCorrect)
    setSolvedThisQuestion(true)
    setPhase('ANSWER_REVEALED')
  }

  function handleJudgeCorrectContinue() {
    setScore(s => s + rewardOnCorrect)
    setSolvedThisQuestion(true)
    setBuzzed(false)
    setPhase('QUESTION_OPEN')
  }

  function handleJudgeWrong() {
    if (question.rapidFire) {
      setBuzzed(false)
      setPhase('QUESTION_OPEN')
      return
    }
    setScore(s => s - penalty)
    setBuzzed(false)
    setPhase('QUESTION_OPEN')
  }

  function handleSkip() {
    setPhase('ANSWER_REVEALED')
  }

  function handleNext() {
    onClose()
  }

  function handleRevealMedia() {
    setRevealedMediaIndex(i => Math.min(questionMedia.length - 1, i + 1))
  }

  let buzzerState: 'armed' | 'pressed' | 'locked' = 'armed'
  if (phase === 'JUDGING' && buzzed) buzzerState = 'pressed'
  else if (phase !== 'QUESTION_OPEN') buzzerState = 'locked'

  const judgeVariant: 'open' | 'judging' | 'reveal' =
    phase === 'JUDGING' ? 'judging' : phase === 'ANSWER_REVEALED' ? 'reveal' : 'open'

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      >
        <motion.div
          className="w-[min(1400px,100%)] h-[min(800px,88dvh)] bg-bg-900 border border-bg-700 rounded-2xl sm:rounded-3xl shadow-[0_30px_80px_-20px_rgb(0_0_0_/_0.7)] flex flex-col overflow-hidden"
          initial={{ scale: 0.96, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={e => e.stopPropagation()}
        >
          <header className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 py-2.5 sm:py-3 border-b border-bg-700">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Eye className="w-4 h-4 text-violet-400 shrink-0" />
              <h2 className="hidden sm:block font-board uppercase tracking-wider text-base sm:text-lg text-ink-50 truncate">
                Frage testen
              </h2>
              <span className="hidden sm:inline-flex items-center gap-2 ml-2">
                <span className="text-cyan-400 font-board uppercase tracking-[0.2em] text-xs">
                  {question.categoryName}
                </span>
                <span className="w-1 h-1 rounded-full bg-bg-600" />
                <span className="text-cyan-400 font-board text-sm">
                  {formatPoints(question.pointValue)}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ModeTabs mode={mode} onChange={setMode} />
              <IconButton label="Reset" onClick={reset} size="sm" tone="subtle">
                <RotateCcw className="w-4 h-4" />
              </IconButton>
              <IconButton label="Schließen" onClick={onClose} size="sm">
                <X className="w-4 h-4" />
              </IconButton>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto bg-bg-950">
            <div
              className={[
                'h-full p-4 sm:p-6 grid gap-4',
                mode === 'all' ? 'grid-cols-1 lg:grid-cols-3 grid-rows-[auto_auto_auto] lg:grid-rows-1' : 'grid-cols-1',
              ].join(' ')}
            >
              {(mode === 'all' || mode === 'tv') && (
                <PanelFrame icon={<Tv className="w-3.5 h-3.5" />} label="TV">
                  <div className="relative w-full aspect-video bg-bg-950 rounded-2xl overflow-hidden border border-bg-700">
                    <QuestionStage
                      phase={phase}
                      question={question}
                      buzzedPlayer={buzzedPlayer}
                      revealedMediaIndex={revealedMediaIndex}
                    />
                  </div>
                </PanelFrame>
              )}

              {(mode === 'all' || mode === 'master') && (
                <PanelFrame icon={<Gamepad2 className="w-3.5 h-3.5" />} label="Master">
                  <PhoneFrame>
                    <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-bg-800 bg-bg-950/95">
                      <PhaseBadge phase={phase} />
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-ink-500 uppercase tracking-widest text-[9px]">Sim. Score</span>
                        <span className="font-board text-cyan-400 text-xl leading-none tabular-nums">
                          {formatPoints(score)}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4">
                      <MasterAnswerCard question={question} />

                      {canRevealMore && (
                        <div className="mt-4">
                          <Button
                            variant="accent"
                            size="md"
                            fullWidth
                            onClick={handleRevealMedia}
                            disabled={phase === 'ANSWER_REVEALED'}
                          >
                            Nächstes Medium freigeben ·{' '}
                            <span className="ml-1 tabular-nums">
                              {Math.max(0, revealedMediaIndex + 1)} / {questionMedia.length}
                            </span>
                          </Button>
                        </div>
                      )}

                      {phase === 'ANSWER_REVEALED' && (
                        <div className="mt-4 px-3 py-2 rounded-xl bg-good/10 border border-good/30 text-good text-xs">
                          {solvedThisQuestion ? 'Richtig beantwortet.' : 'Frage beendet (übersprungen oder offen).'}
                        </div>
                      )}
                    </div>

                    <JudgeBar
                      variant={judgeVariant}
                      noPenalty={noPenalty}
                      rewardOnCorrect={rewardOnCorrect}
                      penaltyOnWrong={-penalty}
                      isRapidFire={question.rapidFire}
                      onSkip={handleSkip}
                      onTogglePenalty={() => setNoPenalty(v => !v)}
                      onJudgeCorrect={handleJudgeCorrect}
                      onJudgeCorrectContinue={handleJudgeCorrectContinue}
                      onJudgeWrong={handleJudgeWrong}
                      onNext={handleNext}
                    />
                  </PhoneFrame>
                </PanelFrame>
              )}

              {(mode === 'all' || mode === 'player') && (
                <PanelFrame icon={<Smartphone className="w-3.5 h-3.5" />} label="Spieler">
                  <PhonePreview
                    question={question}
                    phase={phase}
                    buzzerState={buzzerState}
                    onBuzz={handleBuzz}
                    revealedMediaIndex={revealedMediaIndex}
                    score={score}
                    questionMedia={questionMedia}
                    answerMedia={answerMedia}
                  />
                </PanelFrame>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  const tabs: { key: Mode; label: string; desktopOnly?: boolean }[] = [
    { key: 'all', label: 'Alle', desktopOnly: true },
    { key: 'tv', label: 'TV' },
    { key: 'master', label: 'Master' },
    { key: 'player', label: 'Spieler' },
  ]
  return (
    <div className="inline-flex items-center rounded-full bg-bg-800 border border-bg-700 p-0.5">
      {tabs.map(t => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={[
            'px-2.5 sm:px-3 h-7 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider transition-colors',
            t.desktopOnly ? 'hidden md:inline-flex items-center' : 'inline-flex items-center',
            mode === t.key
              ? 'bg-violet-600 text-ink-50 shadow-sm'
              : 'text-ink-300 hover:text-ink-50',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function PanelFrame({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 min-h-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-ink-500 font-bold">
        {icon}
        {label}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}

interface PhonePreviewProps {
  question: ActiveQuestion
  phase: GamePhase
  buzzerState: 'armed' | 'pressed' | 'locked'
  onBuzz: () => void
  revealedMediaIndex: number
  score: number
  questionMedia: MediaItem[]
  answerMedia: MediaItem[]
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full flex items-stretch justify-center">
      <div className="w-full max-w-[340px] flex flex-col bg-bg-950 rounded-[2rem] border-4 border-bg-700 overflow-hidden shadow-[0_8px_30px_-10px_rgb(0_0_0_/_0.6)]">
        {children}
      </div>
    </div>
  )
}

function PhonePreview({
  question,
  phase,
  buzzerState,
  onBuzz,
  revealedMediaIndex,
  score,
  questionMedia,
  answerMedia,
}: PhonePreviewProps) {
  return (
    <PhoneFrame>
      <>
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-bg-800 bg-bg-950/95">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-ink-50 text-xs font-bold">
              T
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-xs truncate text-ink-50">Testspieler</p>
              <PhaseBadge phase={phase} />
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] uppercase tracking-widest text-ink-500">Score</p>
            <p className="font-board text-xl text-cyan-400 leading-none tabular-nums">{formatPoints(score)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col items-center gap-4">
          <Pill tone="violet">
            {question.categoryName} · {formatPoints(question.pointValue)}
          </Pill>
          <p className="text-center text-ink-200 text-sm font-semibold leading-snug">
            {question.questionText}
          </p>

          {question.showMediaOnPlayer && revealedMediaIndex >= 0 && questionMedia.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="w-full">
              <MediaCarousel
                items={questionMedia.slice(0, revealedMediaIndex + 1)}
                autoplay={false}
              />
            </motion.div>
          )}

          {phase === 'QUESTION_OPEN' && (
            <div className="mt-1">
              <BuzzerButton state={buzzerState} onPress={onBuzz} />
            </div>
          )}

          {phase === 'JUDGING' && (
            <Card className="px-4 py-3 text-center mt-2 w-full">
              <p className="font-board text-amber-400 uppercase tracking-wider text-lg">Du bist dran!</p>
              <p className="text-ink-300 text-xs mt-1">Master bewertet…</p>
            </Card>
          )}

          {phase === 'ANSWER_REVEALED' && (
            <>
              <div className="bg-gradient-to-br from-cyan-400 to-cyan-500 text-bg-950 rounded-2xl px-4 py-4 inline-block border-2 border-cyan-300 text-center w-full">
                <p className="text-[9px] uppercase tracking-[0.25em] text-bg-900/70 mb-1">Antwort</p>
                <p
                  className="font-board uppercase tracking-wide leading-tight"
                  style={{ fontSize: 'clamp(1.1rem, 5vw, 1.5rem)' }}
                >
                  {question.answerText}
                </p>
              </div>
              {answerMedia.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="w-full">
                  <MediaCarousel items={answerMedia} autoplay={false} cropChrome={false} />
                </motion.div>
              )}
            </>
          )}
        </div>
      </>
    </PhoneFrame>
  )
}
