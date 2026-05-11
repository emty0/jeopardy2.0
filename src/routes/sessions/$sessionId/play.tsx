import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { gameSession, gamePlayer, user } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { useGameSocket } from '#/hooks/useGameSocket'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Hourglass, Eye, Vote, Home } from 'lucide-react'
import {
  ConnectionGuard,
  PhaseBadge,
  Scoreboard,
  Avatar,
  BuzzerButton,
  QuestionPicker,
  EventNotificationOverlay,
  SessionClosedOverlay,
} from '#/components/game'
import { Card, Pill, Sheet, MediaCarousel } from '#/components/ui'
import { formatPoints } from '#/lib/format'
import type { MediaItem } from '#/lib/game-state'

const getPlayData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs) throw redirect({ to: '/' })
    if (gs.masterId === session.user.id)
      throw redirect({ to: '/sessions/$sessionId/master', params: { sessionId: data.sessionId } })

    const myPlayer = await db
      .select()
      .from(gamePlayer)
      .where(and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)))
      .get()
    const u = await db
      .select({ buzzerSoundUrl: user.buzzerSoundUrl })
      .from(user)
      .where(eq(user.id, session.user.id))
      .get()

    return {
      playerId: myPlayer?.id ?? null,
      masterId: gs.masterId,
      buzzerSoundUrl: u?.buzzerSoundUrl ?? '/sounds/default-buzz.wav',
    }
  })

export const Route = createFileRoute('/sessions/$sessionId/play')({
  loader: async ({ params }) => getPlayData({ data: { sessionId: params.sessionId } }),
  component: PlayView,
})

function PlayView() {
  const { sessionId } = Route.useParams()
  const { playerId, masterId, buzzerSoundUrl } = Route.useLoaderData()
  const { state, send, connected } = useGameSocket(sessionId, playerId)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastBuzzedRef = useRef<string | null>(null)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)

  useEffect(() => {
    if (state?.buzzedPlayerId && state.buzzedPlayerId !== lastBuzzedRef.current) {
      lastBuzzedRef.current = state.buzzedPlayerId
      if (state.buzzedPlayerId === playerId) {
        audioRef.current?.play().catch(() => {})
      }
    }
  }, [state?.buzzedPlayerId, playerId])

  return (
    <ConnectionGuard ready={!!state}>
      {state && (
        <PlayContent
          state={state}
          playerId={playerId}
          masterId={masterId}
          send={send}
          connected={connected}
          audioRef={audioRef}
          buzzerSoundUrl={buzzerSoundUrl}
          leaderboardOpen={leaderboardOpen}
          setLeaderboardOpen={setLeaderboardOpen}
        />
      )}
    </ConnectionGuard>
  )
}

interface PlayContentProps {
  state: NonNullable<ReturnType<typeof useGameSocket>['state']>
  playerId: string | null
  masterId: string
  send: ReturnType<typeof useGameSocket>['send']
  connected: boolean
  audioRef: React.RefObject<HTMLAudioElement | null>
  buzzerSoundUrl: string
  leaderboardOpen: boolean
  setLeaderboardOpen: (v: boolean) => void
}

function PlayContent({
  state,
  playerId,
  masterId,
  send,
  connected,
  audioRef,
  buzzerSoundUrl,
  leaderboardOpen,
  setLeaderboardOpen,
}: PlayContentProps) {
  const me = state.players.find(p => p.id === playerId)
  const nonMasterPlayers = state.players.filter(p => p.userId !== masterId)
  const isMyTurn = state.activePlayerId === playerId
  const canBuzz = state.phase === 'QUESTION_OPEN' && playerId !== null
  const myBuzzedThisRound = state.buzzedPlayerIds.includes(playerId ?? '')
  const buzzDisabled = !canBuzz || (myBuzzedThisRound && !state.activeQuestion?.allowRebuzz)
  const mySkipVoted = state.skipVotes.includes(playerId ?? '')
  const skipVoteCount = state.skipVotes.length
  const totalVoters = state.players.filter(p => p.userId !== masterId && p.isConnected).length
  const activePlayer = state.players.find(p => p.id === state.activePlayerId)
  const buzzedPlayer = state.players.find(p => p.id === state.buzzedPlayerId)

  function handleBuzz() {
    if (buzzDisabled || !playerId) return
    send('BUZZ', { playerId })
  }

  function handleSelectQuestion(questionId: string) {
    send('SELECT_QUESTION', { questionId })
  }

  let buzzerState: 'armed' | 'pressed' | 'locked' | 'disabled' = 'armed'
  if (buzzDisabled) buzzerState = 'locked'
  if (state.buzzedPlayerId === playerId) buzzerState = 'pressed'

  return (
    <div className="h-[100dvh] bg-bg-950 text-ink-50 max-w-md mx-auto flex flex-col overflow-hidden">
      <audio ref={audioRef} src={buzzerSoundUrl} preload="auto" />

      <header className="shrink-0 flex items-center justify-between gap-3 px-4 pt-4 pb-3 bg-bg-950/95 backdrop-blur-md border-b border-bg-800">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            aria-label="Zur Startseite"
            title="Zur Startseite"
            className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full bg-bg-800 hover:bg-bg-700 text-ink-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <Home className="w-4 h-4" />
          </Link>
          <Avatar name={me?.displayName ?? 'Du'} active={isMyTurn} connected={connected} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{me?.displayName ?? 'Du'}</p>
            <PhaseBadge phase={state.phase} />
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-ink-500">Score</p>
          <p className="font-board text-3xl text-cyan-400 leading-none">
            {formatPoints(me?.score ?? 0)}
          </p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex-1 flex flex-col gap-4"
          >
            {state.phase === 'LOBBY' && <LobbyView players={nonMasterPlayers} />}

            {state.phase === 'SELECTING' && (
              <>
                {isMyTurn ? (
                  <>
                    <p className="text-center text-amber-400 font-bold text-base">
                      Du bist dran. Wähle eine Frage:
                    </p>
                    <QuestionPicker board={state.board} onPick={handleSelectQuestion} />
                  </>
                ) : (
                  <WatchingSelection
                    activeName={activePlayer?.displayName ?? '?'}
                    board={state.board}
                  />
                )}
              </>
            )}

            {state.phase === 'QUESTION_PREVIEW' && state.activeQuestion && (
              <div className="flex flex-col items-center gap-4 mt-6">
                <Pill tone="violet">
                  {state.activeQuestion.categoryName} · {formatPoints(state.activeQuestion.pointValue)}
                </Pill>
                <Card className="p-6 flex flex-col items-center text-center gap-3">
                  <p className="font-board uppercase text-xl text-ink-200 tracking-wider">
                    Frage ausgewählt
                  </p>
                  <p className="text-ink-500 text-sm">Warte auf Master…</p>
                </Card>
              </div>
            )}

            {(state.phase === 'QUESTION_OPEN' ||
              state.phase === 'BUZZING' ||
              state.phase === 'JUDGING') &&
              state.activeQuestion && (
                <QuestionView
                  state={state}
                  playerId={playerId}
                  buzzerState={buzzerState}
                  buzzerSoundUrl={buzzerSoundUrl}
                  myBuzzedThisRound={myBuzzedThisRound}
                  mySkipVoted={mySkipVoted}
                  skipVoteCount={skipVoteCount}
                  totalVoters={totalVoters}
                  buzzedName={buzzedPlayer?.displayName ?? ''}
                  onBuzz={handleBuzz}
                  onVoteSkip={() =>
                    !mySkipVoted && playerId && send('VOTE_SKIP', { playerId })
                  }
                />
              )}

            {state.phase === 'ANSWER_REVEALED' && state.activeQuestion && (
              <RevealView
                category={state.activeQuestion.categoryName}
                points={state.activeQuestion.pointValue}
                answer={state.activeQuestion.answerText}
                answerMedia={state.activeQuestion.mediaItems.filter(m => m.role === 'answer')}
              />
            )}

            {state.phase === 'GAME_OVER' && (
              <GameOverView
                players={state.players}
                masterId={masterId}
                playerId={playerId}
                activePlayerId={state.activePlayerId}
                winnerId={state.winnerId}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <button
        type="button"
        onClick={() => setLeaderboardOpen(true)}
        className="shrink-0 bg-bg-900/95 backdrop-blur-md border-t border-bg-800 px-4 py-2.5 flex items-center justify-between gap-3 z-10 active:bg-bg-800 transition-colors pb-[max(0.625rem,env(safe-area-inset-bottom))]"
      >
        <span className="text-[11px] uppercase tracking-[0.2em] text-ink-500 shrink-0">Rangliste</span>
        <Scoreboard
          players={state.players}
          masterId={masterId}
          activePlayerId={state.activePlayerId}
          selfPlayerId={playerId}
          mode="compact"
        />
      </button>

      <EventNotificationOverlay state={state} surface="player" selfPlayerId={playerId} />

      <Sheet open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} title="Rangliste">
        <div className="px-4 pb-6">
          <Scoreboard
            players={state.players}
            masterId={masterId}
            activePlayerId={state.activePlayerId}
            selfPlayerId={playerId}
            mode="list"
          />
        </div>
      </Sheet>

      {state.phase === 'SESSION_CLOSED' && <SessionClosedOverlay />}
    </div>
  )
}

function LobbyView({ players }: { players: { id: string; displayName: string; isConnected: boolean }[] }) {
  return (
    <Card className="p-6 flex flex-col items-center text-center gap-4 mt-6">
      <Hourglass className="w-10 h-10 text-violet-400" />
      <div>
        <p className="font-board uppercase text-2xl text-ink-50 tracking-wider">Lobby</p>
        <p className="text-ink-300 text-sm mt-1">Warte auf den Spielstart…</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-2">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-2 px-3 h-9 rounded-full bg-bg-700 border border-bg-600">
            <Avatar name={p.displayName} connected={p.isConnected} size="sm" />
            <span className="text-xs font-semibold text-ink-200">{p.displayName}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function WatchingSelection({
  activeName,
  board,
}: {
  activeName: string
  board: { id: string; name: string; questions: { id: string; answered: boolean; pointValue: number }[] }[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5 flex items-center gap-3">
        <Eye className="w-5 h-5 text-violet-400" />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500">Aktiv</p>
          <p className="font-bold text-ink-50 truncate">
            <span className="text-amber-400">{activeName}</span> wählt eine Frage…
          </p>
        </div>
      </Card>
      <div className="flex flex-col gap-2 opacity-60 pointer-events-none">
        <p className="text-[11px] uppercase tracking-[0.2em] text-ink-500 px-1">Board</p>
        {board.map(cat => {
          const open = cat.questions.filter(q => !q.answered).length
          return (
            <div
              key={cat.id}
              className="flex items-center justify-between px-4 py-3 rounded-2xl bg-bg-800/60 border border-bg-700/40"
            >
              <p className="font-board uppercase tracking-wider text-base text-ink-200 truncate">
                {cat.name}
              </p>
              <p className="text-[11px] uppercase tracking-widest text-ink-500">
                {open}/{cat.questions.length}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface QuestionViewProps {
  state: NonNullable<ReturnType<typeof useGameSocket>['state']>
  playerId: string | null
  buzzerState: 'armed' | 'pressed' | 'locked' | 'disabled'
  buzzerSoundUrl: string
  myBuzzedThisRound: boolean
  mySkipVoted: boolean
  skipVoteCount: number
  totalVoters: number
  buzzedName: string
  onBuzz: () => void
  onVoteSkip: () => void
}

function QuestionView({
  state,
  playerId,
  buzzerState,
  buzzerSoundUrl,
  myBuzzedThisRound,
  mySkipVoted,
  skipVoteCount,
  totalVoters,
  buzzedName,
  onBuzz,
  onVoteSkip,
}: QuestionViewProps) {
  if (!state.activeQuestion) return null
  const q = state.activeQuestion

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="flex flex-col items-center gap-2">
        <Pill tone="violet">
          {q.categoryName} · {formatPoints(q.pointValue)}
        </Pill>
        <p className="text-center text-ink-200 text-base font-semibold leading-snug max-w-[28ch]">
          {q.questionText}
        </p>
      </div>

      {q.showMediaOnPlayer && state.revealedMediaIndex >= 0 && (() => {
        const questionMedia = q.mediaItems.filter(m => m.role === 'question')
        if (questionMedia.length === 0) return null
        return (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <MediaCarousel
              items={questionMedia.slice(0, state.revealedMediaIndex + 1)}
              autoplay={false}
            />
          </motion.div>
        )
      })()}

      {state.phase === 'QUESTION_OPEN' && (
        <>
          <BuzzerButton
            state={buzzerState}
            label={myBuzzedThisRound && q.allowRebuzz ? 'NOCHMAL' : 'BUZZ!'}
            hint={
              buzzerState === 'locked' && !myBuzzedThisRound
                ? 'gesperrt'
                : buzzerState === 'pressed'
                  ? 'gedrückt'
                  : undefined
            }
            onPress={onBuzz}
            buzzerSoundUrl={buzzerSoundUrl}
            playSoundOnPress={state.buzzedPlayerId === playerId}
          />
          <button
            type="button"
            onClick={onVoteSkip}
            disabled={mySkipVoted}
            className={[
              'inline-flex items-center gap-2 h-10 px-4 rounded-full text-xs font-semibold border transition-colors',
              mySkipVoted
                ? 'border-bg-600 bg-bg-800 text-ink-500 cursor-not-allowed'
                : 'border-bg-600 bg-bg-800 hover:bg-bg-700 text-ink-200',
            ].join(' ')}
          >
            <Vote className="w-3.5 h-3.5" />
            {mySkipVoted ? 'Skip-Vote abgegeben' : 'Frage überspringen'}
            <span className="text-ink-500 tabular-nums">
              {skipVoteCount}/{totalVoters}
            </span>
          </button>
        </>
      )}

      {(state.phase === 'BUZZING' || state.phase === 'JUDGING') && (
        <>
          {state.buzzedPlayerId === playerId ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-2 mt-4 px-6 py-5 rounded-3xl bg-amber-500/10 border-2 border-amber-500/40 text-center"
            >
              <p className="font-board text-amber-400 uppercase tracking-wider text-3xl animate-pulse">
                Du bist dran!
              </p>
              <p className="text-ink-300 text-sm">Master bewertet deine Antwort…</p>
            </motion.div>
          ) : (
            <Card className="px-5 py-4 text-center mt-4">
              <p className="text-ink-300 text-sm">
                <span className="text-amber-400 font-semibold">{buzzedName}</span> antwortet…
              </p>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function RevealView({
  category,
  points,
  answer,
  answerMedia,
}: {
  category: string
  points: number
  answer: string
  answerMedia: MediaItem[]
}) {
  return (
    <div className="flex flex-col items-center gap-4 mt-6">
      <Pill tone="violet">
        {category} · {formatPoints(points)}
      </Pill>
      <motion.div
        initial={{ opacity: 0, scale: 0.94, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.25 }}
        className="bg-gradient-to-br from-cyan-400 to-cyan-500 text-bg-950 rounded-3xl px-6 py-6 inline-block border-2 border-cyan-300 shadow-[var(--shadow-glow-cyan)] text-center"
      >
        <p className="text-[10px] uppercase tracking-[0.25em] text-bg-900/70 mb-2">Antwort</p>
        <p
          className="font-board uppercase tracking-wide leading-tight"
          style={{ fontSize: 'clamp(1.5rem, 7vw, 2.25rem)' }}
        >
          {answer}
        </p>
      </motion.div>
      {answerMedia && answerMedia.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="w-full"
        >
          <MediaCarousel items={answerMedia} autoplay={false} cropChrome={false} />
        </motion.div>
      )}
      <p className="text-ink-500 text-xs uppercase tracking-widest">Warte auf den Master…</p>
    </div>
  )
}

function GameOverView({
  players,
  masterId,
  playerId,
  activePlayerId,
  winnerId,
}: {
  players: NonNullable<ReturnType<typeof useGameSocket>['state']>['players']
  masterId: string
  playerId: string | null
  activePlayerId: string | null
  winnerId: string | null
}) {
  const winner = players.find(p => p.id === winnerId)
  return (
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
        <p className="font-board uppercase text-3xl text-ink-50 tracking-wider">Game Over</p>
        {winner && (
          <p className="text-ink-300 mt-1">
            Sieger: <span className="text-amber-400 font-semibold">{winner.displayName}</span>
          </p>
        )}
      </div>
      <div className="w-full mt-2">
        <Scoreboard
          players={players}
          masterId={masterId}
          activePlayerId={activePlayerId}
          selfPlayerId={playerId}
          mode="list"
        />
      </div>
    </div>
  )
}
