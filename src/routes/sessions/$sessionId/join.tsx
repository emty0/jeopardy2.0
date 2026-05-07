import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const joinSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionId: z.string(), code: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')

    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: `/auth/login` })

    const gs = await db
      .select()
      .from(gameSession)
      .where(and(eq(gameSession.id, data.sessionId), eq(gameSession.joinCode, data.code)))
      .get()
    if (!gs) throw new Error('Ungültiger Join-Code oder Session nicht gefunden.')
    if (gs.status === 'finished') throw new Error('Diese Spielrunde ist bereits beendet.')

    const existing = await db
      .select()
      .from(gamePlayer)
      .where(and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)))
      .get()

    if (!existing) {
      const { pickPlayerColor } = await import('#/lib/playerColors')
      const others = await db
        .select({ color: gamePlayer.color })
        .from(gamePlayer)
        .where(eq(gamePlayer.sessionId, data.sessionId))
        .all()
      const color = pickPlayerColor(others.map(o => o.color), session.user.id)
      await db.insert(gamePlayer).values({
        id: nanoid(10),
        sessionId: data.sessionId,
        userId: session.user.id,
        displayName: session.user.name ?? session.user.email ?? 'Spieler',
        score: 0,
        isConnected: true,
        color,
      })
    }

    return { isMaster: gs.masterId === session.user.id }
  })

export const Route = createFileRoute('/sessions/$sessionId/join')({
  validateSearch: z.object({ code: z.string().optional() }),
  component: JoinPage,
})

function JoinPage() {
  const { sessionId } = Route.useParams()
  const { code } = Route.useSearch()
  const navigate = useNavigate()

  useEffect(() => {
    if (!code) {
      navigate({ to: '/sessions/$sessionId', params: { sessionId } })
      return
    }
    joinSession({ data: { sessionId, code } })
      .then(({ isMaster }) => {
        if (isMaster) {
          navigate({ to: '/sessions/$sessionId/master', params: { sessionId } })
        } else {
          navigate({ to: '/sessions/$sessionId/play', params: { sessionId } })
        }
      })
      .catch(() => navigate({ to: '/' }))
  }, [sessionId, code, navigate])

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <span className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
          <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
        </div>
        <p className="text-ink-300 text-sm tracking-wide">Session wird beigetreten…</p>
      </div>
    </div>
  )
}
