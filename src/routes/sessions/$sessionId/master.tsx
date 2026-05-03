import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { useGameSocket } from '#/hooks/useGameSocket'
import { z } from 'zod'

const getMasterData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs || gs.masterId !== session.user.id) throw redirect({ to: '/' })

    const myPlayer = await db.select().from(gamePlayer)
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

  if (!state) {
    return (
      <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
        <p className="text-white animate-pulse">Verbinde…</p>
      </div>
    )
  }

  const nonMasterPlayers = state.players.filter(p => p.userId !== masterId)

  return (
    <div className="min-h-screen bg-neutral-900 text-white max-w-sm mx-auto p-4 pb-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-bold text-lg">Master</h1>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
          {connected ? 'Verbunden' : 'Getrennt'}
        </span>
      </div>

      {/* Scoreboard */}
      <div className="bg-neutral-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs uppercase tracking-wide text-neutral-400 mb-2">Punkte</h2>
        <div className="space-y-1.5">
          {[...nonMasterPlayers].sort((a, b) => b.score - a.score).map(p => (
            <div key={p.id} className={`flex items-center justify-between text-sm ${p.id === state.activePlayerId ? 'text-yellow-300 font-bold' : ''}`}>
              <span>{p.displayName}{p.id === state.activePlayerId ? ' ←' : ''}</span>
              <span>{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase-specific controls */}
      {state.phase === 'LOBBY' && (
        <div>
          <p className="text-neutral-400 text-sm mb-4">{nonMasterPlayers.length} Spieler in der Lobby</p>
          <button
            onClick={() => send('START_GAME', {})}
            disabled={nonMasterPlayers.length === 0}
            className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-black text-xl rounded-2xl transition-colors"
          >
            Spiel starten!
          </button>
        </div>
      )}

      {state.phase === 'SELECTING' && (
        <div className="text-center py-8">
          <p className="text-neutral-400">
            <span className="text-yellow-300 font-bold">{state.players.find(p => p.id === state.activePlayerId)?.displayName}</span> wählt eine Frage…
          </p>
        </div>
      )}

      {(state.phase === 'QUESTION_OPEN') && state.activeQuestion && (
        <div className="bg-neutral-800 rounded-xl p-4">
          <p className="text-xs text-yellow-400 uppercase tracking-wide mb-2">Frage offen — warte auf Buzzer</p>
          <p className="text-lg font-semibold mb-3">{state.activeQuestion.questionText}</p>
          <div className="bg-green-900 border border-green-700 rounded-lg p-3">
            <p className="text-xs text-green-400 mb-1">Antwort (nur für dich):</p>
            <p className="text-green-200 font-bold">{state.activeQuestion.answerText}</p>
          </div>
        </div>
      )}

      {(state.phase === 'JUDGING') && state.activeQuestion && state.buzzedPlayerId && (
        <div>
          <div className="bg-yellow-900 border border-yellow-700 rounded-xl p-4 mb-4 text-center">
            <p className="text-yellow-300 font-bold text-lg">
              🔔 {state.players.find(p => p.id === state.buzzedPlayerId)?.displayName}
            </p>
            <p className="text-yellow-200 text-sm">hat gebuzzert!</p>
          </div>
          <div className="bg-neutral-800 rounded-xl p-4 mb-4">
            <p className="text-sm text-neutral-300 mb-1">{state.activeQuestion.questionText}</p>
            <div className="bg-green-900 border border-green-700 rounded-lg p-3 mt-2">
              <p className="text-xs text-green-400 mb-1">Antwort:</p>
              <p className="text-green-200 font-bold">{state.activeQuestion.answerText}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => send('JUDGE', { correct: true, playerId: state.buzzedPlayerId })}
              className="py-4 bg-green-600 hover:bg-green-500 text-white font-black text-lg rounded-2xl transition-colors"
            >
              ✓ Richtig<br />
              <span className="text-sm font-normal">+{state.activeQuestion.pointValue}</span>
            </button>
            <button
              onClick={() => send('JUDGE', { correct: false, playerId: state.buzzedPlayerId })}
              className="py-4 bg-red-600 hover:bg-red-500 text-white font-black text-lg rounded-2xl transition-colors"
            >
              ✗ Falsch<br />
              <span className="text-sm font-normal">−{Math.round(state.activeQuestion.pointValue * state.wrongAnswerPenalty)}</span>
            </button>
          </div>
        </div>
      )}

      {state.phase === 'ANSWER_REVEALED' && state.activeQuestion && (
        <div>
          <div className="bg-yellow-500 text-black rounded-xl p-4 text-center mb-4">
            <p className="text-xs uppercase tracking-wide mb-1">Antwort</p>
            <p className="text-2xl font-black">{state.activeQuestion.answerText}</p>
          </div>
          <button
            onClick={() => send('NEXT_ROUND', {})}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-lg rounded-2xl transition-colors"
          >
            Weiter →
          </button>
        </div>
      )}

      {state.phase === 'GAME_OVER' && (
        <div className="text-center py-8">
          <p className="text-5xl mb-3">🏆</p>
          <p className="text-2xl font-black text-yellow-400">Spiel beendet!</p>
          {state.winnerId && (
            <p className="text-lg text-white mt-2">
              Gewinner: <span className="text-yellow-300">{state.players.find(p => p.id === state.winnerId)?.displayName}</span>
            </p>
          )}
        </div>
      )}

      {/* Board mini-view for selecting phase */}
      {state.phase === 'SELECTING' && (
        <div className="mt-4 overflow-x-auto">
          <div
            className="grid gap-1 text-center"
            style={{ gridTemplateColumns: `repeat(${state.board.length}, minmax(60px, 1fr))` }}
          >
            {state.board.map(cat => (
              <p key={cat.id} className="text-xs text-neutral-400 truncate px-1">{cat.name}</p>
            ))}
            {state.board[0]?.questions.map((_, rowIdx) =>
              state.board.map(cat => {
                const q = cat.questions[rowIdx]
                return q ? (
                  <button
                    key={q.id}
                    onClick={() => !q.answered && send('SELECT_QUESTION', { questionId: q.id })}
                    className={`text-xs py-2 rounded font-bold transition-all ${
                      q.answered
                        ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                        : 'bg-blue-700 hover:bg-blue-600 text-yellow-300'
                    }`}
                  >
                    {q.answered ? '—' : q.pointValue}
                  </button>
                ) : <div key={`${cat.id}-${rowIdx}`} />
              })
            )}
          </div>
          <p className="text-xs text-neutral-600 mt-2 text-center">Frage für aktiven Spieler wählen (falls nötig)</p>
        </div>
      )}
    </div>
  )
}
