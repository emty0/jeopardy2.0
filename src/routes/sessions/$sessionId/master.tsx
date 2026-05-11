import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { useGameSocket } from '#/hooks/useGameSocket'
import { useState } from 'react'
import type { PlayerState } from '#/lib/game-state'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Hourglass, Trophy, ListChecks, Home, Tv, Plus, Minus } from 'lucide-react'
import {
  ConnectionGuard,
  PhaseBadge,
  Scoreboard,
  MasterAnswerCard,
  JudgeBar,
  QuestionPicker,
  EventNotificationOverlay,
  SessionClosedOverlay,
} from '#/components/game'
import { Card, Pill, Sheet, Input } from '#/components/ui'
import { formatPoints } from '#/lib/format'

const getMasterData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs || gs.masterId !== session.user.id) throw redirect({ to: '/' })

    const myPlayer = await db
      .select()
      .from(gamePlayer)
      .where(and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)))
      .get()

    return { playerId: myPlayer?.id ?? null, masterId: session.user.id }
  })

export const Route = createFileRoute('/sessions/$sessionId/master')({
  loader: async ({ params }) => getMasterData({ data: { sessionId: params.sessionId } }),
  component: MasterView,
})

function MasterView() {
  const { sessionId } = Route.useParams()
  const { playerId, masterId } = Route.useLoaderData()
  const { state, send, connected } = useGameSocket(sessionId, playerId)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideTab, setOverrideTab] = useState<'question' | 'score' | 'settings'>('question')

  return (
    <ConnectionGuard ready={!!state}>
      {state && (
        <MasterContent
          state={state}
          masterId={masterId}
          send={send}
          connected={connected}
          overrideOpen={overrideOpen}
          setOverrideOpen={setOverrideOpen}
          overrideTab={overrideTab}
          setOverrideTab={setOverrideTab}
        />
      )}
    </ConnectionGuard>
  )
}

interface MasterContentProps {
  state: NonNullable<ReturnType<typeof useGameSocket>['state']>
  masterId: string
  send: ReturnType<typeof useGameSocket>['send']
  connected: boolean
  overrideOpen: boolean
  setOverrideOpen: (v: boolean) => void
  overrideTab: 'question' | 'score' | 'settings'
  setOverrideTab: (v: 'question' | 'score' | 'settings') => void
}

function MasterContent({
  state,
  masterId,
  send,
  connected,
  overrideOpen,
  setOverrideOpen,
  overrideTab,
  setOverrideTab,
}: MasterContentProps) {
  const { sessionId } = Route.useParams()
  const [confirmClose, setConfirmClose] = useState(false)
  const nonMasterPlayers = state.players.filter(p => p.userId !== masterId)
  const buzzedPlayer = state.players.find(p => p.id === state.buzzedPlayerId)
  const activePlayer = state.players.find(p => p.id === state.activePlayerId)

  const questionMediaCount = state.activeQuestion?.mediaItems.filter(m => m.role === 'question').length ?? 0
  const canRevealMedia =
    (state.phase === 'QUESTION_OPEN' || state.phase === 'JUDGING') &&
    !!state.activeQuestion &&
    questionMediaCount > 0 &&
    (state.activeQuestion.showMediaOnPlayer || state.activeQuestion.mediaPlaceholder) &&
    state.revealedMediaIndex < questionMediaCount - 1
  const revealedCount = state.revealedMediaIndex + 1
  const totalMedia = questionMediaCount

  const reward = state.activeQuestion?.pointValue ?? 0
  const penalty = state.noNegativePoints
    ? 0
    : -Math.round((state.activeQuestion?.pointValue ?? 0) * state.wrongAnswerPenalty)

  const judgeVariant: 'lobby' | 'preview' | 'open' | 'judging' | 'reveal' | 'idle' =
    state.phase === 'LOBBY'
      ? 'lobby'
      : state.phase === 'QUESTION_PREVIEW'
        ? 'preview'
        : state.phase === 'QUESTION_OPEN'
          ? 'open'
          : state.phase === 'JUDGING'
            ? 'judging'
            : state.phase === 'ANSWER_REVEALED'
              ? 'reveal'
              : 'idle'

  return (
    <div className="h-[100dvh] bg-bg-950 text-ink-50 max-w-md mx-auto flex flex-col overflow-hidden">
      <header className="shrink-0 z-20 bg-bg-950/95 backdrop-blur-md border-b border-bg-800 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              aria-label="Zur Startseite"
              title="Zur Startseite"
              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-bg-800 hover:bg-bg-700 text-ink-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              <Home className="w-4 h-4" />
            </Link>
            <span className="font-board uppercase tracking-widest text-cyan-400 text-sm">Master</span>
            <PhaseBadge phase={state.phase} />
          </div>
          <div className="flex items-center gap-2">
            <Pill tone={connected ? 'good' : 'bad'}>{connected ? 'Online' : 'Offline'}</Pill>
            <a
              href={`/sessions/${sessionId}/board`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-6 px-2.5 text-[11px] rounded-full bg-bg-700 hover:bg-bg-600 text-ink-200 font-semibold transition-colors"
              title="TV-Ansicht öffnen"
            >
              <Tv className="w-3 h-3" />
              TV
            </a>
            {state.phase !== 'GAME_OVER' && (
              <button
                type="button"
                onClick={() => setOverrideOpen(true)}
                className="inline-flex items-center gap-1.5 h-6 px-2.5 text-[11px] rounded-full bg-bg-700 hover:bg-bg-600 text-ink-200 font-semibold transition-colors"
                title="Frage manuell wählen"
              >
                <ListChecks className="w-3 h-3" />
                Override
              </button>
            )}
          </div>
        </div>
        <Scoreboard
          players={state.players}
          masterId={masterId}
          activePlayerId={state.activePlayerId}
          mode="row"
        />
      </header>

      <PendingJoinBanner pending={state.pendingJoiners ?? []} send={send} />

      <main className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-4"
          >
            {state.phase === 'LOBBY' && (
              <Card className="p-6 flex flex-col items-center text-center gap-3 mt-4">
                <Hourglass className="w-10 h-10 text-violet-400" />
                <p className="font-board uppercase text-2xl tracking-wider">Lobby</p>
                <p className="text-ink-300 text-sm">
                  {nonMasterPlayers.length}{' '}
                  {nonMasterPlayers.length === 1 ? 'Spieler' : 'Spieler'} bereit
                </p>
              </Card>
            )}

            {state.phase === 'SELECTING' && (
              <Card className="p-5 flex items-center gap-3 mt-4">
                <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                  <ListChecks className="w-5 h-5 text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Wartet auf</p>
                  <p className="font-bold text-ink-50 truncate">
                    <span className="text-amber-400">
                      {activePlayer?.displayName ?? '?'}
                    </span>{' '}
                    wählt eine Frage
                  </p>
                </div>
              </Card>
            )}

            {state.phase === 'QUESTION_PREVIEW' && state.activeQuestion && (
              <>
                <Pill tone="violet" className="self-start">
                  Vorschau · {formatPoints(state.activeQuestion.pointValue)}
                </Pill>
                <MasterAnswerCard question={state.activeQuestion} />
              </>
            )}

            {state.phase === 'QUESTION_OPEN' && state.activeQuestion && (
              <>
                <Pill tone="amber" className="self-start">
                  Buzzer offen · {formatPoints(state.activeQuestion.pointValue)}
                </Pill>
                {(state.activeQuestion.showMediaOnPlayer || state.activeQuestion.mediaPlaceholder) &&
                  questionMediaCount > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => send('REVEAL_NEXT_MEDIA', {})}
                        disabled={!canRevealMedia}
                        className={[
                          'w-full h-11 rounded-xl border font-semibold text-sm transition-colors',
                          canRevealMedia
                            ? 'bg-violet-500/15 border-violet-500/40 text-violet-300 hover:bg-violet-500/25'
                            : 'bg-bg-800/40 border-bg-700 text-ink-500 cursor-not-allowed',
                        ].join(' ')}
                      >
                        Nächstes Medium freigeben
                      </button>
                      <p className="text-[11px] text-ink-500 text-center tabular-nums">
                        {revealedCount} / {totalMedia} freigegeben
                      </p>
                    </div>
                )}
                <MasterAnswerCard question={state.activeQuestion} />
                {state.skipVotes.length > 0 && (
                  <p className="text-xs text-ink-300 text-center">
                    Skip-Votes: {state.skipVotes.length} /{' '}
                    {state.players.filter(p => p.userId !== masterId && p.isConnected).length}
                  </p>
                )}
              </>
            )}

            {state.phase === 'JUDGING' && state.activeQuestion && buzzedPlayer && (
              <>
                <motion.div
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 px-5 py-4 flex items-center gap-3"
                >
                  <Bell className="w-6 h-6 text-amber-400" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400">
                      Gebuzzert
                    </p>
                    <p className="font-board uppercase text-2xl tracking-wider truncate">
                      {buzzedPlayer.displayName}
                    </p>
                  </div>
                </motion.div>
                {(state.activeQuestion.showMediaOnPlayer || state.activeQuestion.mediaPlaceholder) &&
                  questionMediaCount > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={() => send('REVEAL_NEXT_MEDIA', {})}
                        disabled={!canRevealMedia}
                        className={[
                          'w-full h-11 rounded-xl border font-semibold text-sm transition-colors',
                          canRevealMedia
                            ? 'bg-violet-500/15 border-violet-500/40 text-violet-300 hover:bg-violet-500/25'
                            : 'bg-bg-800/40 border-bg-700 text-ink-500 cursor-not-allowed',
                        ].join(' ')}
                      >
                        Nächstes Medium freigeben
                      </button>
                      <p className="text-[11px] text-ink-500 text-center tabular-nums">
                        {revealedCount} / {totalMedia} freigegeben
                      </p>
                    </div>
                )}
                <MasterAnswerCard question={state.activeQuestion} />
              </>
            )}

            {state.phase === 'ANSWER_REVEALED' && state.activeQuestion && (
              <div className="flex flex-col items-center gap-4 mt-4">
                <Pill tone="violet">
                  {state.activeQuestion.categoryName} ·{' '}
                  {formatPoints(state.activeQuestion.pointValue)}
                </Pill>
                <motion.div
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-br from-cyan-400 to-cyan-500 text-bg-950 rounded-3xl px-6 py-6 border-2 border-cyan-300 shadow-[var(--shadow-glow-cyan)] text-center"
                >
                  <p className="text-[10px] uppercase tracking-[0.25em] text-bg-900/70 mb-2">
                    Antwort
                  </p>
                  <p
                    className="font-board uppercase tracking-wide leading-tight"
                    style={{ fontSize: 'clamp(1.75rem, 7vw, 2.5rem)' }}
                  >
                    {state.activeQuestion.answerText}
                  </p>
                </motion.div>
              </div>
            )}

            {state.phase === 'GAME_OVER' && (
              <div className="flex flex-col items-center gap-5 mt-4">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-[var(--shadow-glow-amber)]"
                >
                  <Trophy className="w-10 h-10 text-bg-950" />
                </motion.div>
                <div className="text-center">
                  <p className="font-board uppercase text-3xl tracking-wider">Game Over</p>
                  {state.winnerId && (
                    <p className="text-ink-300 mt-1">
                      Sieger:{' '}
                      <span className="text-amber-400 font-semibold">
                        {state.players.find(p => p.id === state.winnerId)?.displayName}
                      </span>
                    </p>
                  )}
                </div>
                <Scoreboard
                  players={state.players}
                  masterId={masterId}
                  activePlayerId={state.activePlayerId}
                  mode="list"
                />
                <Link
                  to="/sessions/$sessionId/recap"
                  params={{ sessionId }}
                  className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-violet-500 hover:bg-violet-400 text-bg-950 font-bold shadow-[var(--shadow-glow-violet)] transition-colors"
                >
                  Recap ansehen →
                </Link>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <JudgeBar
        variant={judgeVariant}
        canStart={nonMasterPlayers.length > 0}
        noPenalty={state.noNegativePoints}
        rewardOnCorrect={reward}
        penaltyOnWrong={penalty}
        isRapidFire={state.activeQuestion?.rapidFire ?? false}
        onStart={() => send('START_GAME', {})}
        onStartQuestion={() => send('START_QUESTION', {})}
        onSkip={() => send('SKIP_QUESTION', {})}
        onTogglePenalty={() => send('TOGGLE_NO_PENALTY', {})}
        onJudgeCorrect={() =>
          state.buzzedPlayerId &&
          send('JUDGE', { correct: true, playerId: state.buzzedPlayerId, closeQuestion: true })
        }
        onJudgeCorrectContinue={() =>
          state.buzzedPlayerId &&
          send('JUDGE', { correct: true, playerId: state.buzzedPlayerId, closeQuestion: false })
        }
        onJudgeWrong={() =>
          state.buzzedPlayerId &&
          send('JUDGE', { correct: false, playerId: state.buzzedPlayerId })
        }
        onNext={() => send('NEXT_ROUND', {})}
      />

      <EventNotificationOverlay state={state} surface="master" />

      {state.phase === 'SESSION_CLOSED' && <SessionClosedOverlay />}

      <Sheet
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Override"
      >
        <div className="px-4 py-2 flex flex-col h-full">
          <div className="flex gap-2 mb-4 shrink-0">
            <button
              type="button"
              onClick={() => setOverrideTab('question')}
              className={[
                'flex-1 h-9 rounded-lg text-xs font-bold transition-colors',
                overrideTab === 'question'
                  ? 'bg-violet-500 text-white'
                  : 'bg-bg-800 text-ink-300 hover:bg-bg-700',
              ].join(' ')}
            >
              Frage
            </button>
            <button
              type="button"
              onClick={() => setOverrideTab('score')}
              className={[
                'flex-1 h-9 rounded-lg text-xs font-bold transition-colors',
                overrideTab === 'score'
                  ? 'bg-violet-500 text-white'
                  : 'bg-bg-800 text-ink-300 hover:bg-bg-700',
              ].join(' ')}
            >
              Punkte
            </button>
            <button
              type="button"
              onClick={() => setOverrideTab('settings')}
              className={[
                'flex-1 h-9 rounded-lg text-xs font-bold transition-colors',
                overrideTab === 'settings'
                  ? 'bg-violet-500 text-white'
                  : 'bg-bg-800 text-ink-300 hover:bg-bg-700',
              ].join(' ')}
            >
              Einstellungen
            </button>
          </div>

          {overrideTab === 'question' && (
            <div className="flex-1 overflow-y-auto">
              <p className="text-xs text-ink-300 mb-3">
                Override – springt direkt in die ausgewählte Frage.
              </p>
              <QuestionPicker
                board={state.board}
                onPick={qid => {
                  send('SELECT_QUESTION', { questionId: qid })
                  setOverrideOpen(false)
                }}
              />
            </div>
          )}

          {overrideTab === 'score' && (
            <ScoreOverridePanel
              players={nonMasterPlayers}
              send={send}
            />
          )}

          {overrideTab === 'settings' && (
            <div className="flex-1 overflow-y-auto flex flex-col gap-4">
              <p className="text-xs text-ink-300">
                Sitzungseinstellungen.
              </p>
              <div className="flex flex-col gap-3">
                {!confirmClose ? (
                  <button
                    type="button"
                    onClick={() => setConfirmClose(true)}
                    className="w-full h-11 rounded-xl border font-semibold text-sm transition-colors bg-bad/15 border-bad/40 text-bad hover:bg-bad/25"
                  >
                    Session schließen
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-ink-300 text-center">
                      Bist du sicher? Das Quiz wird sofort für alle beendet.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmClose(false)}
                        className="flex-1 h-10 rounded-lg text-xs font-bold bg-bg-800 text-ink-300 hover:bg-bg-700 transition-colors"
                      >
                        Abbrechen
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          send('CLOSE_SESSION', {})
                          setConfirmClose(false)
                          setOverrideOpen(false)
                        }}
                        className="flex-1 h-10 rounded-lg text-xs font-bold bg-bad hover:bg-bad/80 text-white transition-colors"
                      >
                        Beenden
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  )
}

function ScoreOverridePanel({
  players,
  send,
}: {
  players: PlayerState[]
  send: (type: string, payload?: Record<string, unknown>) => void
}) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(players[0]?.id ?? null)
  const [amount, setAmount] = useState('')

  const selectedPlayer = players.find(p => p.id === selectedPlayerId)

  const sendDelta = (delta: number) => {
    if (!selectedPlayerId) return
    send('ADJUST_SCORE', { playerId: selectedPlayerId, delta })
    setAmount('')
  }

  const handleCustom = (sign: 1 | -1) => {
    const val = parseInt(amount, 10)
    if (!Number.isFinite(val) || val <= 0 || !selectedPlayerId) return
    sendDelta(val * sign)
  }

  return (
    <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
      <p className="text-xs text-ink-300">
        Wähle einen Spieler und tippe auf + / −.
      </p>

      <div className="flex flex-col gap-2">
        {players.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelectedPlayerId(p.id)}
            className={[
              'flex items-center justify-between px-3 py-3 rounded-xl border text-left transition-colors',
              selectedPlayerId === p.id
                ? 'bg-violet-500/15 border-violet-500/50'
                : 'bg-bg-800 border-bg-700 hover:bg-bg-750',
            ].join(' ')}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="font-semibold text-sm truncate">{p.displayName}</span>
            </div>
            <span className="text-sm text-ink-200 tabular-nums shrink-0">
              {formatPoints(p.score)}
            </span>
          </button>
        ))}
      </div>

      {selectedPlayer && (
        <div className="flex flex-col gap-3 mt-1 pb-2">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Betrag"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => handleCustom(-1)}
              disabled={!amount || parseInt(amount, 10) <= 0}
              className="h-11 w-11 rounded-xl bg-bg-700 hover:bg-bg-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-ink-50 font-bold shrink-0 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleCustom(1)}
              disabled={!amount || parseInt(amount, 10) <= 0}
              className="h-11 w-11 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white font-bold shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => sendDelta(-100)}
              className="flex-1 h-10 rounded-xl bg-bg-700 hover:bg-bg-600 text-ink-50 text-sm font-bold transition-colors"
            >
              −100
            </button>
            <button
              type="button"
              onClick={() => sendDelta(100)}
              className="flex-1 h-10 rounded-xl bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold transition-colors"
            >
              +100
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PendingJoinBanner({
  pending,
  send,
}: {
  pending: { userId: string; displayName: string }[]
  send: (type: string, payload?: Record<string, unknown>) => void
}) {
  if (!pending.length) return null
  return (
    <div className="shrink-0 px-3 pt-2 flex flex-col gap-2">
      {pending.map(p => (
        <div
          key={p.userId}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-500/15 border border-violet-500/40 backdrop-blur-md"
        >
          <span className="text-[11px] uppercase tracking-widest text-violet-300">Beitrittsanfrage</span>
          <span className="font-semibold text-ink-50 truncate flex-1 min-w-0">{p.displayName}</span>
          <button
            type="button"
            onClick={() => send('REJECT_PENDING_JOIN', { userId: p.userId })}
            className="h-7 px-2 text-[11px] rounded-md bg-bg-700 hover:bg-bg-600 text-ink-200 font-semibold"
          >
            Ablehnen
          </button>
          <button
            type="button"
            onClick={() => send('ADMIT_PENDING_JOIN', { userId: p.userId })}
            className="h-7 px-2 text-[11px] rounded-md bg-good/80 hover:bg-good text-ink-50 font-semibold"
          >
            Akzeptieren
          </button>
        </div>
      ))}
    </div>
  )
}
