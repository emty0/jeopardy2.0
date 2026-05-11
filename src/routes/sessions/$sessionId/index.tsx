import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { gameSession, gamePlayer, quiz } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { QRCodeSVG } from 'qrcode.react'
import { z } from 'zod'
import { useGameSocket } from '#/hooks/useGameSocket'
import { useState } from 'react'
import { Tv, Smartphone, Copy, Check, Crown, Radio } from 'lucide-react'
import {
  Button,
  Card,
  Pill,
  PageContainer,
  PageHeader,
} from '#/components/ui'
import { Avatar } from '#/components/game/Scoreboard'
import { SessionClosedOverlay } from '#/components/game'

const getSessionData = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) {
      const { db } = await import('#/db/index')
      const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
      const redirectUrl = gs ? `/sessions/${data.sessionId}/join?code=${gs.joinCode}` : `/sessions/${data.sessionId}`
      throw redirect({ to: '/auth/login', search: { redirect: redirectUrl } })
    }

    const { db } = await import('#/db/index')

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs) throw new Error('Session nicht gefunden')

    const players = await db
      .select()
      .from(gamePlayer)
      .where(eq(gamePlayer.sessionId, data.sessionId))
      .all()
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
  const { session, players: initialPlayers, quizTitle, isMaster, baseUrl } = Route.useLoaderData()
  const { sessionId } = Route.useParams()
  const { state, send } = useGameSocket(sessionId, null)
  const joinUrl = `${baseUrl}/sessions/${session.id}/join?code=${session.joinCode}`
  const [copied, setCopied] = useState(false)

  const livePlayers =
    state?.players ??
    initialPlayers.map(p => ({
      id: p.id,
      displayName: p.displayName,
      score: p.score,
      isConnected: p.isConnected,
      userId: p.userId,
      color: p.color,
    }))

  function copyJoinUrl() {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <PageContainer size="lg">
      <PageHeader
        eyebrow="Lobby"
        title={quizTitle}
        subtitle="Spieler joinen über QR-Code oder Link."
        trailing={
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.25em] text-ink-500 mb-1">Join-Code</p>
            <p className="font-board text-4xl sm:text-5xl tracking-[0.18em] text-cyan-400 leading-none">
              {session.joinCode}
            </p>
          </div>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="p-6 flex flex-col items-center text-center gap-4">
          <p className="font-board uppercase tracking-wider text-lg text-ink-50">QR-Code</p>
          <div className="bg-white p-3 rounded-2xl shadow-[var(--shadow-tile)]">
            <QRCodeSVG value={joinUrl} size={180} />
          </div>
          <button
            type="button"
            onClick={copyJoinUrl}
            className="inline-flex items-center gap-1.5 text-xs text-ink-300 hover:text-cyan-300 transition-colors break-all"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Kopiert' : 'Link kopieren'}
          </button>
          <p className="text-xs text-ink-500 break-all max-w-full">{joinUrl}</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-board uppercase tracking-wider text-lg text-ink-50">
              Spieler ({livePlayers.length})
            </p>
            {state && (
              <Pill tone="good" leading={<Radio className="w-3 h-3 animate-pulse" />}>
                Live
              </Pill>
            )}
          </div>
          {livePlayers.length === 0 ? (
            <p className="text-ink-500 text-sm py-6 text-center">Noch keine Spieler…</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {livePlayers.map(p => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 px-3 h-12 rounded-xl bg-bg-800/60 border border-bg-700"
                >
                  <Avatar name={p.displayName} connected={p.isConnected} size="sm" />
                  <span className="text-sm font-medium text-ink-50 flex-1 truncate">
                    {p.displayName}
                  </span>
                  {p.userId === session.masterId && (
                    <Pill tone="amber" leading={<Crown className="w-3 h-3" />}>
                      Master
                    </Pill>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {isMaster && state?.pendingJoiners && state.pendingJoiners.length > 0 && (
        <Card className="mt-5 p-4 flex flex-col gap-2 border-violet-500/40">
          <p className="font-board uppercase tracking-wider text-sm text-violet-300">
            Beitrittsanfragen ({state.pendingJoiners.length})
          </p>
          {state.pendingJoiners.map(p => (
            <div key={p.userId} className="flex items-center gap-2">
              <span className="flex-1 truncate text-ink-50 font-medium">{p.displayName}</span>
              <Button variant="subtle" size="sm" onClick={() => send('REJECT_PENDING_JOIN', { userId: p.userId })}>
                Ablehnen
              </Button>
              <Button variant="success" size="sm" onClick={() => send('ADMIT_PENDING_JOIN', { userId: p.userId })}>
                Akzeptieren
              </Button>
            </div>
          ))}
        </Card>
      )}

      {isMaster && (
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/sessions/$sessionId/board"
              params={{ sessionId: session.id }}
              target="_blank"
              className="flex-1"
            >
              <Button variant="accent" size="lg" fullWidth leading={<Tv className="w-5 h-5" />}>
                Board (TV) öffnen
              </Button>
            </Link>
            <Link
              to="/sessions/$sessionId/master"
              params={{ sessionId: session.id }}
              className="flex-1"
            >
              <Button variant="primary" size="lg" fullWidth leading={<Smartphone className="w-5 h-5" />}>
                Master-Ansicht
              </Button>
            </Link>
          </div>
          <p className="text-xs text-ink-500 text-center">
            Öffne das Board am TV, dann starte über die Master-Ansicht auf deinem Handy.
          </p>
        </div>
      )}

      {!isMaster && (
        <div className="mt-6">
          <Link to="/sessions/$sessionId/play" params={{ sessionId: session.id }}>
            <Button
              variant="primary"
              size="xl"
              fullWidth
              leading={<Smartphone className="w-5 h-5" />}
            >
              Zum Spiel
            </Button>
          </Link>
        </div>
      )}

      {state?.phase === 'SESSION_CLOSED' && <SessionClosedOverlay />}
    </PageContainer>
  )
}
