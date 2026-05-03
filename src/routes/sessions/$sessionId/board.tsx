import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { useGameSocket } from '#/hooks/useGameSocket'
import { z } from 'zod'

const getBoardData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    const myPlayer = session
      ? await db.select().from(gamePlayer)
          .where(and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)))
          .get()
      : null
    return { playerId: myPlayer?.id ?? null, masterId: gs?.masterId ?? null, userId: session?.user.id ?? null }
  })

export const Route = createFileRoute('/sessions/$sessionId/board')({
  loader: async ({ params }) => getBoardData({ data: { sessionId: params.sessionId } }),
  component: BoardView,
})

function getYoutubeId(url: string) {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  return m ? m[1] : null
}

function BoardView() {
  const { sessionId } = Route.useParams()
  const { playerId } = Route.useLoaderData()
  const { state } = useGameSocket(sessionId, playerId)

  if (!state) {
    return (
      <div className="h-screen bg-blue-950 flex items-center justify-center">
        <p className="text-white text-2xl animate-pulse">Verbinde…</p>
      </div>
    )
  }

  const cols = state.board.length

  return (
    <div className="h-screen bg-blue-950 flex flex-col p-2 gap-2 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-blue-900 rounded-xl">
        <h1 className="text-yellow-400 font-black text-2xl tracking-wider">JEOPARDY</h1>
        <div className="flex gap-6">
          {state.players
            .filter(p => p.userId !== state.masterId)
            .sort((a, b) => b.score - a.score)
            .map(p => (
              <div key={p.id} className={`text-center ${p.id === state.activePlayerId ? 'text-yellow-300' : 'text-white'}`}>
                <p className="text-xs uppercase tracking-wide opacity-70">{p.displayName}</p>
                <p className="text-2xl font-black">{p.score}</p>
              </div>
            ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 relative overflow-hidden">
        {/* Board */}
        <div
          className="h-full grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `auto repeat(${state.board[0]?.questions.length ?? 5}, 1fr)` }}
        >
          {state.board.map(cat => (
            <div key={cat.id} className="bg-blue-800 border border-blue-700 rounded-lg flex items-center justify-center p-2">
              <span className="text-white font-bold text-center text-sm leading-tight uppercase tracking-wide">{cat.name}</span>
            </div>
          ))}
          {state.board[0]?.questions.map((_, rowIdx) =>
            state.board.map(cat => {
              const q = cat.questions[rowIdx]
              if (!q) return <div key={`${cat.id}-${rowIdx}`} />
              return (
                <div
                  key={q.id}
                  className={`rounded-lg border flex items-center justify-center transition-all ${
                    q.answered
                      ? 'bg-blue-950 border-blue-900 opacity-30'
                      : 'bg-blue-700 border-blue-600'
                  }`}
                >
                  {!q.answered && (
                    <span className="text-yellow-300 font-black text-3xl sm:text-4xl">{q.pointValue}</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Question Overlay */}
        {(state.phase === 'QUESTION_OPEN' || state.phase === 'BUZZING' || state.phase === 'JUDGING' || state.phase === 'ANSWER_REVEALED') && state.activeQuestion && (
          <div className="absolute inset-0 bg-blue-950/95 flex flex-col items-center justify-center p-8 text-center">
            <div className="max-w-4xl w-full">
              <p className="text-yellow-400 text-lg font-bold mb-2 uppercase tracking-widest">
                {state.activeQuestion.categoryName} — {state.activeQuestion.pointValue}
              </p>

              {state.activeQuestion.youtubeUrl && (
                <div className="mb-4 flex justify-center">
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${getYoutubeId(state.activeQuestion.youtubeUrl)}?autoplay=1`}
                    className="w-full max-w-2xl aspect-video rounded-xl"
                    allow="autoplay"
                  />
                </div>
              )}
              {state.activeQuestion.mediaUrl && state.activeQuestion.mediaType === 'image' && (
                <img src={state.activeQuestion.mediaUrl} alt="" className="max-h-64 mx-auto rounded-xl mb-4 object-contain" />
              )}
              {state.activeQuestion.mediaUrl && state.activeQuestion.mediaType === 'audio' && (
                <audio src={state.activeQuestion.mediaUrl} autoPlay controls className="mx-auto mb-4" />
              )}
              {state.activeQuestion.mediaUrl && state.activeQuestion.mediaType === 'video' && (
                <video src={state.activeQuestion.mediaUrl} autoPlay controls className="max-h-64 mx-auto rounded-xl mb-4" />
              )}

              <p className="text-white text-4xl sm:text-5xl font-bold leading-tight mb-6">
                {state.activeQuestion.questionText}
              </p>

              {state.phase === 'ANSWER_REVEALED' && (
                <div className="bg-yellow-500 text-black rounded-2xl px-8 py-4 inline-block">
                  <p className="text-3xl font-black">{state.activeQuestion.answerText}</p>
                </div>
              )}

              {(state.phase === 'BUZZING' || state.phase === 'JUDGING') && state.buzzedPlayerId && (
                <div className="mt-6 animate-bounce">
                  <p className="text-yellow-300 text-2xl font-bold">
                    🔔 {state.players.find(p => p.id === state.buzzedPlayerId)?.displayName ?? '?'} hat gebuzzert!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Game Over Overlay */}
        {state.phase === 'GAME_OVER' && (
          <div className="absolute inset-0 bg-blue-950/95 flex flex-col items-center justify-center p-8 text-center">
            <p className="text-6xl mb-4">🏆</p>
            <h2 className="text-5xl font-black text-yellow-400 mb-2">Spiel beendet!</h2>
            {state.winnerId && (
              <p className="text-3xl text-white mt-2">
                Gewinner: <span className="text-yellow-300 font-bold">{state.players.find(p => p.id === state.winnerId)?.displayName}</span>
              </p>
            )}
            <div className="mt-8 space-y-2">
              {[...state.players]
                .filter(p => p.userId !== state.masterId)
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <div key={p.id} className="flex items-center gap-4 text-xl">
                    <span className="text-neutral-400 w-6">{i + 1}.</span>
                    <span className="text-white font-bold">{p.displayName}</span>
                    <span className="text-yellow-300 ml-auto">{p.score}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Lobby / Selecting indicator */}
        {state.phase === 'LOBBY' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-800 px-6 py-3 rounded-full">
            <p className="text-white text-sm">Warte auf Spielstart…</p>
          </div>
        )}
        {state.phase === 'SELECTING' && state.activePlayerId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-yellow-500 text-black px-6 py-3 rounded-full font-bold">
            <p>{state.players.find(p => p.id === state.activePlayerId)?.displayName} wählt eine Frage…</p>
          </div>
        )}
      </div>
    </div>
  )
}
