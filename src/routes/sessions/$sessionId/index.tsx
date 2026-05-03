import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { gameSession, gamePlayer, quiz } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { QRCodeSVG } from 'qrcode.react'
import { z } from 'zod'

const getSessionData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login' })

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs) throw new Error('Session nicht gefunden')

    const players = await db.select().from(gamePlayer).where(eq(gamePlayer.sessionId, data.sessionId)).all()
    const q = await db.select({ title: quiz.title }).from(quiz).where(eq(quiz.id, gs.quizId)).get()

    return {
      session: gs,
      players,
      quizTitle: q?.title ?? '?',
      isMaster: gs.masterId === session.user.id,
      userId: session.user.id,
      baseUrl: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    }
  })

export const Route = createFileRoute('/sessions/$sessionId/')({
  loader: async ({ params }) => getSessionData({ data: { sessionId: params.sessionId } }),
  component: SessionLobbyPage,
})

function SessionLobbyPage() {
  const { session, players, quizTitle, isMaster, baseUrl } = Route.useLoaderData()
  const joinUrl = `${baseUrl}/sessions/${session.id}/join?code=${session.joinCode}`

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Lobby</h1>
          <p className="text-neutral-400">{quizTitle}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-neutral-500 mb-1">Join-Code</p>
          <p className="text-3xl font-black text-yellow-400 tracking-widest font-mono">{session.joinCode}</p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col items-center">
          <h2 className="font-semibold mb-4">QR-Code zum Joinen</h2>
          <div className="bg-white p-3 rounded-xl">
            <QRCodeSVG value={joinUrl} size={180} />
          </div>
          <p className="text-xs text-neutral-500 mt-3 text-center break-all">{joinUrl}</p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="font-semibold mb-4">Spieler ({players.length})</h2>
          {players.length === 0 ? (
            <p className="text-neutral-500 text-sm">Noch keine Spieler…</p>
          ) : (
            <ul className="space-y-2">
              {players.map(p => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="text-sm">{p.displayName}</span>
                  {p.userId === session.masterId && (
                    <span className="text-xs text-yellow-400 ml-auto">Master</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-neutral-600 mt-4">Die Seite neu laden um neue Spieler zu sehen.</p>
        </div>
      </div>

      {isMaster && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex gap-3">
            <Link
              to="/sessions/$sessionId/board"
              params={{ sessionId: session.id }}
              target="_blank"
              className="flex-1 text-center py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors"
            >
              📺 Board-Ansicht öffnen (TV)
            </Link>
            <Link
              to="/sessions/$sessionId/master"
              params={{ sessionId: session.id }}
              className="flex-1 text-center py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl transition-colors"
            >
              📱 Master-Ansicht
            </Link>
          </div>
          <p className="text-xs text-neutral-500 text-center">
            Öffne die Board-Ansicht auf dem TV-Gerät, dann starte das Spiel über die Master-Ansicht.
          </p>
        </div>
      )}

      {!isMaster && (
        <div className="mt-6">
          <Link
            to="/sessions/$sessionId/play"
            params={{ sessionId: session.id }}
            className="block text-center py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl transition-colors"
          >
            🎮 Zum Spiel
          </Link>
        </div>
      )}
    </div>
  )
}
