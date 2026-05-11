import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { useGameSocket } from '#/hooks/useGameSocket'
import { z } from 'zod'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Home, Users } from 'lucide-react'
import {   ConnectionGuard, BoardGrid, QuestionStage, Scoreboard, EventNotificationOverlay, SessionClosedOverlay } from '#/components/game'

const getBoardData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    const myPlayer = session
      ? await db
          .select()
          .from(gamePlayer)
          .where(
            and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)),
          )
          .get()
      : null
    return {
      playerId: myPlayer?.id ?? null,
      masterId: gs?.masterId ?? null,
      userId: session?.user.id ?? null,
    }
  })

export const Route = createFileRoute('/sessions/$sessionId/board')({
  loader: async ({ params }) => getBoardData({ data: { sessionId: params.sessionId } }),
  component: BoardView,
})

function BoardView() {
  const { sessionId } = Route.useParams()
  const { playerId } = Route.useLoaderData()
  const { state } = useGameSocket(sessionId, playerId)

  return (
    <ConnectionGuard ready={!!state} message="TV verbindet sich mit Spiel…">
      {state && <BoardContent state={state} />}
    </ConnectionGuard>
  )
}

function BoardContent({
  state,
}: {
  state: NonNullable<ReturnType<typeof useGameSocket>['state']>
}) {
  const { sessionId } = Route.useParams()
  const buzzedPlayer = state.players.find(p => p.id === state.buzzedPlayerId) ?? null
  const showOverlay =
    (state.phase === 'QUESTION_PREVIEW' ||
      state.phase === 'QUESTION_OPEN' ||
      state.phase === 'BUZZING' ||
      state.phase === 'JUDGING' ||
      state.phase === 'ANSWER_REVEALED') &&
    state.activeQuestion

  const activePlayer = state.players.find(p => p.id === state.activePlayerId)

  return (
    <div className="h-screen bg-bg-950 text-ink-50 flex flex-col p-4 gap-4 overflow-hidden">
      <header className="flex items-center justify-between gap-6 px-4 py-3 rounded-2xl bg-bg-900/60 border border-bg-800 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            aria-label="Zur Startseite"
            title="Zur Startseite"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-bg-800 hover:bg-bg-700 text-ink-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <Home className="w-5 h-5" />
          </Link>
          <span className="font-board uppercase tracking-[0.18em] text-3xl bg-gradient-to-r from-violet-400 via-cyan-300 to-violet-400 bg-clip-text text-transparent">
            Jeopardy 2.0
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Scoreboard
            players={state.players}
            masterId={state.masterId}
            activePlayerId={state.activePlayerId}
            mode="row"
          />
          {state.pendingJoiners && state.pendingJoiners.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-violet-500/30 border border-violet-400/60 text-violet-100 text-[11px] font-bold" title="Spieler warten auf Freigabe">
              +{state.pendingJoiners.length}
            </span>
          )}
          <Link
            to="/sessions/$sessionId"
            params={{ sessionId }}
            aria-label="Zurück zur Lobby"
            title="Zurück zur Lobby (Spieler einladen)"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-bg-800 hover:bg-bg-700 text-ink-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <Users className="w-5 h-5" />
          </Link>
        </div>
      </header>

      <div className="flex-1 relative overflow-hidden">
        <BoardGrid board={state.board} />

        <AnimatePresence>
          {showOverlay && state.activeQuestion && (
            <QuestionStage
              key={state.activeQuestion.id}
              phase={state.phase}
              question={state.activeQuestion}
              buzzedPlayer={buzzedPlayer}
              revealedMediaIndex={state.revealedMediaIndex}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {state.phase === 'GAME_OVER' && (
            <motion.div
              key="game-over"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-gradient-to-b from-bg-950/95 via-bg-900/95 to-bg-950/95 backdrop-blur-md flex flex-col items-center justify-center p-12 text-center"
            >
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-[var(--shadow-glow-amber)] mb-6"
              >
                <Trophy className="w-16 h-16 text-bg-950" />
              </motion.div>
              <p className="font-board uppercase text-7xl tracking-wider text-ink-50">Game Over</p>
              {state.winnerId && (
                <p className="text-3xl text-ink-300 mt-3">
                  Sieger:{' '}
                  <span className="text-amber-400 font-bold">
                    {state.players.find(p => p.id === state.winnerId)?.displayName}
                  </span>
                </p>
              )}
              <div className="mt-10 w-full max-w-xl">
                {[...state.players]
                  .filter(p => p.userId !== state.masterId)
                  .sort((a, b) => b.score - a.score)
                  .map((p, i) => (
                    <motion.div
                      key={p.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + i * 0.18 }}
                      className="flex items-center gap-4 px-6 py-3 rounded-2xl bg-bg-800/60 border border-bg-700 mb-2"
                    >
                      <span className="font-board text-2xl text-ink-500 w-8 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-left text-2xl font-semibold text-ink-50 truncate">
                        {p.displayName}
                      </span>
                      <span className="font-board text-3xl text-cyan-400 tabular-nums">
                        {p.score.toLocaleString('de-DE')}
                      </span>
                    </motion.div>
                  ))}
              </div>
              <Link
                to="/sessions/$sessionId/recap"
                params={{ sessionId }}
                className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-violet-500 hover:bg-violet-400 text-bg-950 font-bold text-lg shadow-[var(--shadow-glow-violet)] transition-colors"
              >
                Recap ansehen →
              </Link>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {state.phase === 'LOBBY' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-bg-800 border border-bg-700 text-ink-200 text-sm tracking-wide"
            >
              Warte auf Spielstart…
            </motion.div>
          )}
          {state.phase === 'SELECTING' && state.activePlayerId && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full bg-amber-500 text-bg-950 font-bold tracking-wide shadow-[var(--shadow-glow-amber)] border-2 border-amber-300"
            >
              {activePlayer?.displayName ?? '?'} wählt eine Frage…
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <EventNotificationOverlay state={state} surface="tv" />

      {state.phase === 'SESSION_CLOSED' && <SessionClosedOverlay />}
    </div>
  )
}
