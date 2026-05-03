import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect } from 'react'
import { auth } from '#/lib/auth'
import { db } from '#/db/index'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'

const joinSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionId: z.string(), code: z.string() }))
  .handler(async ({ data }) => {
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
      await db.insert(gamePlayer).values({
        id: nanoid(10),
        sessionId: data.sessionId,
        userId: session.user.id,
        displayName: session.user.name ?? session.user.email ?? 'Spieler',
        score: 0,
        isConnected: true,
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
    <div className="flex items-center justify-center min-h-[80vh]">
      <p className="text-neutral-400 text-lg">Session wird beigetreten…</p>
    </div>
  )
}
