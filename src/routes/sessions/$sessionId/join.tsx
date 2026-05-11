import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useEffect, useState } from 'react'
import { gameSession, gamePlayer } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { ConfirmLeaveSessionModal } from '#/components/ui/ConfirmLeaveSessionModal'
import { useGameSocket } from '#/hooks/useGameSocket'
import { Button } from '#/components/ui'

const joinSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionId: z.string(), code: z.string(), confirmLeavePrevious: z.boolean().optional() }))
  .handler(async ({ data }): Promise<{ status: 'joined' | 'pending'; isMaster: boolean }> => {
    const { auth } = await import('#/lib/auth')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw redirect({ to: '/auth/login', search: { redirect: `/sessions/${data.sessionId}/join?code=${data.code}` } })

    const { db } = await import('#/db/index')

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

    // Re-Join in dieselbe Session → kein Konflikt-Check
    if (!existing) {
      const { findActiveSessionForUser, conflictError } = await import('#/lib/sessionGuard')
      const conflict = await findActiveSessionForUser(session.user.id, data.sessionId)
      if (conflict && !data.confirmLeavePrevious) throw conflictError(conflict)
      if (conflict && data.confirmLeavePrevious) {
        const { cleanupSessionForUser, broadcastState } = await import('#/lib/game-state')
        await cleanupSessionForUser(session.user.id, conflict.sessionId)
        await broadcastState(conflict.sessionId)
      }
    }

    const isMaster = gs.masterId === session.user.id

    if (!existing) {
      // Late-Join während laufender Session → in Pending-Liste, Master muss freigeben
      if (gs.status === 'active' && !isMaster) {
        const { addPendingJoiner, broadcastState } = await import('#/lib/game-state')
        addPendingJoiner(data.sessionId, {
          userId: session.user.id,
          displayName: session.user.name ?? session.user.email ?? 'Spieler',
          requestedAt: Date.now(),
        })
        await broadcastState(data.sessionId)
        return { status: 'pending', isMaster: false }
      }

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
      // Live-Update an alle Peers (Lobby zeigt neue Spieler ohne F5)
      const { broadcastState } = await import('#/lib/game-state')
      await broadcastState(data.sessionId)
    }

    return { status: 'joined', isMaster }
  })

const getCurrentUserId = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('#/lib/auth')
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  return session?.user.id ?? null
})

export const Route = createFileRoute('/sessions/$sessionId/join')({
  validateSearch: z.object({ code: z.string().optional() }),
  component: JoinPage,
})

type ViewState =
  | { kind: 'loading' }
  | { kind: 'conflict'; conflict: { sessionId: string; isMaster: boolean } }
  | { kind: 'pending' }
  | { kind: 'rejected' }
  | { kind: 'error'; message: string }

function JoinPage() {
  const { sessionId } = Route.useParams()
  const { code } = Route.useSearch()
  const navigate = useNavigate()
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const [userId, setUserId] = useState<string | null>(null)

  async function attempt(confirmLeavePrevious: boolean) {
    if (!code) return
    setView({ kind: 'loading' })
    try {
      const res = await joinSession({ data: { sessionId, code, confirmLeavePrevious } })
      if (res.status === 'pending') {
        setView({ kind: 'pending' })
        return
      }
      if (res.isMaster) {
        navigate({ to: '/sessions/$sessionId/master', params: { sessionId } })
      } else {
        navigate({ to: '/sessions/$sessionId/play', params: { sessionId } })
      }
    } catch (e: unknown) {
      const { parseConflictError } = await import('#/lib/sessionGuard')
      const conflict = parseConflictError(e)
      if (conflict) {
        setView({ kind: 'conflict', conflict })
        return
      }
      setView({ kind: 'error', message: e instanceof Error ? e.message : 'Fehler beim Beitreten.' })
    }
  }

  useEffect(() => {
    if (!code) {
      navigate({ to: '/sessions/$sessionId', params: { sessionId } })
      return
    }
    getCurrentUserId().then(uid => {
      if (!uid) {
        const redirectUrl = window.location.pathname + window.location.search
        window.location.href = `/auth/login?redirect=${encodeURIComponent(redirectUrl)}`
        return
      }
      setUserId(uid)
      attempt(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, code])

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        {view.kind === 'loading' && (
          <>
            <Spinner />
            <p className="text-ink-300 text-sm tracking-wide">Session wird beigetreten…</p>
          </>
        )}
        {view.kind === 'pending' && userId && (
          <PendingWait
            sessionId={sessionId}
            userId={userId}
            onAdmitted={() => navigate({ to: '/sessions/$sessionId/play', params: { sessionId } })}
            onRejected={() => setView({ kind: 'rejected' })}
          />
        )}
        {view.kind === 'rejected' && (
          <>
            <h2 className="font-board uppercase tracking-wider text-2xl text-bad">Anfrage abgelehnt</h2>
            <p className="text-ink-400 text-sm">Der Spielleiter hat deine Beitrittsanfrage abgelehnt.</p>
            <Button variant="subtle" onClick={() => navigate({ to: '/' })}>Zur Startseite</Button>
          </>
        )}
        {view.kind === 'error' && (
          <>
            <h2 className="font-board uppercase tracking-wider text-2xl text-bad">Fehler</h2>
            <p className="text-ink-400 text-sm">{view.message}</p>
            <Button variant="subtle" onClick={() => navigate({ to: '/' })}>Zur Startseite</Button>
          </>
        )}
      </div>

      <ConfirmLeaveSessionModal
        open={view.kind === 'conflict'}
        onCancel={() => navigate({ to: '/' })}
        onConfirm={() => attempt(true)}
      />
    </div>
  )
}

function PendingWait({
  sessionId,
  userId,
  onAdmitted,
  onRejected,
}: {
  sessionId: string
  userId: string
  onAdmitted: () => void
  onRejected: () => void
}) {
  const { state } = useGameSocket(sessionId, null)
  const [seenPending, setSeenPending] = useState(false)
  useEffect(() => {
    if (!state) return
    if (state.players.some(p => p.userId === userId)) { onAdmitted(); return }
    const isPending = state.pendingJoiners?.some(p => p.userId === userId) ?? false
    if (isPending) setSeenPending(true)
    if (seenPending && !isPending) onRejected()
  }, [state, userId, onAdmitted, onRejected, seenPending])
  return (
    <>
      <Spinner />
      <h2 className="font-board uppercase tracking-wider text-2xl text-ink-50">Warte auf Freigabe</h2>
      <p className="text-ink-400 text-sm">Der Spielleiter wurde benachrichtigt. Sobald er dich akzeptiert, geht's los.</p>
    </>
  )
}

function Spinner() {
  return (
    <div className="relative w-12 h-12">
      <span className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
      <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
    </div>
  )
}
