import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { gameSession, gamePlayer, user } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { useGameSocket } from '#/hooks/useGameSocket'
import { useRef, useEffect } from 'react'
import { z } from 'zod'

const getPlayData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs) throw redirect({ to: '/' })
    if (gs.masterId === session.user.id) throw redirect({ to: '/sessions/$sessionId/master', params: { sessionId: data.sessionId } })

    const myPlayer = await db.select().from(gamePlayer)
      .where(and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)))
      .get()
    const u = await db.select({ buzzerSoundUrl: user.buzzerSoundUrl }).from(user).where(eq(user.id, session.user.id)).get()

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

  useEffect(() => {
    if (state?.buzzedPlayerId && state.buzzedPlayerId !== lastBuzzedRef.current) {
      lastBuzzedRef.current = state.buzzedPlayerId
      if (state.buzzedPlayerId === playerId) {
        audioRef.current?.play().catch(() => {})
      }
    }
  }, [state?.buzzedPlayerId, playerId])

  if (!state) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-white animate-pulse">Verbinde…</p>
      </div>
    )
  }

  const me = state.players.find(p => p.id === playerId)
  const nonMasterPlayers = state.players.filter(p => p.userId !== masterId)
  const isMyTurn = state.activePlayerId === playerId
  const canBuzz = state.phase === 'QUESTION_OPEN' && playerId !== null
  const myBuzzedThisRound = state.buzzedPlayerIds.includes(playerId ?? '')
  const buzzDisabled = !canBuzz || (myBuzzedThisRound && !state.activeQuestion?.allowRebuzz)

  function handleBuzz() {
    if (buzzDisabled || !playerId) return
    send('BUZZ', { playerId })
  }

  function handleSelectQuestion(questionId: string) {
    send('SELECT_QUESTION', { questionId })
  }

  return (
    <div className="min-h-screen bg-neutral-900 text-white max-w-sm mx-auto p-4 pb-8 flex flex-col">
      <audio ref={audioRef} src={buzzerSoundUrl} preload="auto" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="font-bold">{me?.displayName ?? 'Du'}</p>
          <p className="text-2xl font-black text-yellow-400">{me?.score ?? 0}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {connected ? 'Online' : 'Offline'}
        </span>
      </div>

      {/* Phase display */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {state.phase === 'LOBBY' && (
          <div className="text-center">
            <p className="text-4xl mb-3">⏳</p>
            <p className="text-neutral-400">Warte auf Spielstart…</p>
          </div>
        )}

        {state.phase === 'SELECTING' && (
          <div className="w-full">
            {isMyTurn ? (
              <>
                <p className="text-center text-yellow-300 font-bold text-lg mb-4">Du bist dran! Wähle eine Frage:</p>
                <div
                  className="grid gap-1.5"
                  style={{ gridTemplateColumns: `repeat(${state.board.length}, 1fr)` }}
                >
                  {state.board.map(cat => (
                    <p key={cat.id} className="text-xs text-neutral-400 text-center truncate">{cat.name}</p>
                  ))}
                  {state.board[0]?.questions.map((_, rowIdx) =>
                    state.board.map(cat => {
                      const q = cat.questions[rowIdx]
                      return q ? (
                        <button
                          key={q.id}
                          onClick={() => !q.answered && handleSelectQuestion(q.id)}
                          disabled={q.answered}
                          className={`py-3 rounded-lg font-bold text-sm transition-all ${
                            q.answered
                              ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                              : 'bg-blue-700 hover:bg-blue-600 active:scale-95 text-yellow-300'
                          }`}
                        >
                          {q.answered ? '—' : q.pointValue}
                        </button>
                      ) : <div key={`${cat.id}-${rowIdx}`} />
                    })
                  )}
                </div>
              </>
            ) : (
              <div className="text-center">
                <p className="text-4xl mb-3">🎲</p>
                <p className="text-neutral-400">
                  <span className="text-yellow-300 font-bold">{state.players.find(p => p.id === state.activePlayerId)?.displayName}</span> wählt…
                </p>
              </div>
            )}
          </div>
        )}

        {(state.phase === 'QUESTION_OPEN' || state.phase === 'BUZZING' || state.phase === 'JUDGING') && state.activeQuestion && (
          <div className="w-full text-center">
            <p className="text-sm text-yellow-400 uppercase tracking-widest mb-2">
              {state.activeQuestion.categoryName} — {state.activeQuestion.pointValue}
            </p>
            <p className="text-xl font-bold mb-8 leading-snug">{state.activeQuestion.questionText}</p>

            {state.phase === 'QUESTION_OPEN' && (
              <button
                onClick={handleBuzz}
                disabled={buzzDisabled}
                className={`w-48 h-48 rounded-full font-black text-2xl transition-all active:scale-95 shadow-lg ${
                  buzzDisabled
                    ? 'bg-neutral-700 text-neutral-500 cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500 text-white shadow-red-900'
                }`}
              >
                {myBuzzedThisRound && state.activeQuestion.allowRebuzz ? 'NOCHMAL' : 'BUZZ!'}
              </button>
            )}

            {(state.phase === 'BUZZING' || state.phase === 'JUDGING') && (
              <div className="text-center">
                {state.buzzedPlayerId === playerId ? (
                  <div>
                    <p className="text-3xl font-black text-yellow-300 animate-pulse">Du bist dran!</p>
                    <p className="text-neutral-400 mt-2">Master bewertet deine Antwort…</p>
                  </div>
                ) : (
                  <p className="text-neutral-400">
                    <span className="text-yellow-300 font-bold">{state.players.find(p => p.id === state.buzzedPlayerId)?.displayName}</span> antwortet…
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {state.phase === 'ANSWER_REVEALED' && state.activeQuestion && (
          <div className="text-center">
            <p className="text-sm text-neutral-400 mb-2">Antwort:</p>
            <div className="bg-yellow-500 text-black rounded-2xl px-6 py-4 inline-block">
              <p className="text-2xl font-black">{state.activeQuestion.answerText}</p>
            </div>
            <p className="text-neutral-500 text-sm mt-4">Warte auf den Master…</p>
          </div>
        )}

        {state.phase === 'GAME_OVER' && (
          <div className="text-center">
            <p className="text-5xl mb-3">🏆</p>
            <p className="text-2xl font-black text-yellow-400">Spiel beendet!</p>
            {state.winnerId && (
              <p className="text-lg text-white mt-2">
                Gewinner: <span className="text-yellow-300">{state.players.find(p => p.id === state.winnerId)?.displayName}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-neutral-800 rounded-xl p-3 mt-4">
        <p className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Rangliste</p>
        <div className="space-y-1">
          {[...nonMasterPlayers].sort((a, b) => b.score - a.score).map((p, i) => (
            <div key={p.id} className={`flex items-center gap-2 text-sm ${p.id === playerId ? 'text-yellow-300 font-bold' : 'text-neutral-300'}`}>
              <span className="text-neutral-500 w-4">{i + 1}.</span>
              <span className="flex-1 truncate">{p.displayName}{p.id === playerId ? ' (Du)' : ''}</span>
              <span>{p.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
