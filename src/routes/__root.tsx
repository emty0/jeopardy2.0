import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  Link,
  Outlet,
  useLocation,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useState, useRef, useEffect } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { getRequest } from '@tanstack/react-start/server'
import { motion } from 'framer-motion'
import { Plus, Mail, Settings as SettingsIcon, LogOut, Library, Sparkles, ShieldCheck, Radio, X as XIcon, BarChart3, FlaskConical } from 'lucide-react'
import { Button, IconButton, Modal, FormField, Input, Wordmark } from '#/components/ui'
import { Avatar } from '#/components/game/Scoreboard'

const getActiveGame = createServerFn({ method: 'GET' }).handler(async () => {
  const { auth } = await import('#/lib/auth')
  const { db } = await import('#/db/index')
  const { gameSession, gamePlayer } = await import('#/db/schema')
  const { eq, and, ne } = await import('drizzle-orm')
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) return null

  const asMaster = await db
    .select({ id: gameSession.id })
    .from(gameSession)
    .where(and(eq(gameSession.masterId, session.user.id), ne(gameSession.status, 'finished')))
    .get()
  if (asMaster) return { sessionId: asMaster.id, isMaster: true }

  const asPlayer = await db
    .select({ sessionId: gamePlayer.sessionId })
    .from(gamePlayer)
    .innerJoin(gameSession, eq(gameSession.id, gamePlayer.sessionId))
    .where(and(eq(gamePlayer.userId, session.user.id), ne(gameSession.status, 'finished')))
    .get()
  if (asPlayer) return { sessionId: asPlayer.sessionId, isMaster: false }

  return null
})

const leaveSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')
    const { gameSession, gamePlayer } = await import('#/db/schema')
    const { eq, and } = await import('drizzle-orm')
    const { gameStateMap } = await import('#/lib/game-state')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) return

    const gs = await db.select().from(gameSession).where(eq(gameSession.id, data.sessionId)).get()
    if (!gs) return

    if (gs.masterId === session.user.id) {
      await db
        .update(gameSession)
        .set({ status: 'finished', currentState: 'SESSION_CLOSED', finishedAt: new Date() })
        .where(eq(gameSession.id, data.sessionId))
    } else {
      await db
        .delete(gamePlayer)
        .where(and(eq(gamePlayer.sessionId, data.sessionId), eq(gamePlayer.userId, session.user.id)))
    }
    gameStateMap.delete(data.sessionId)
    const { broadcastState } = await import('#/lib/game-state')
    await broadcastState(data.sessionId)
  })

const quickInvite = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const { auth } = await import('#/lib/auth')
    const { db } = await import('#/db/index')
    const { invite } = await import('#/db/schema')
    const request = getRequest()
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session) throw new Error('Nicht angemeldet')
    const token = nanoid(8)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await db
      .insert(invite)
      .values({ id: token, email: data.email, invitedById: session.user.id, expiresAt })
    const link = `${process.env.BETTER_AUTH_URL || 'http://localhost:3000'}/auth/register?token=${token}`
    const { sendInviteEmail } = await import('#/lib/email')
    await sendInviteEmail(data.email, link)
    return { link }
  })

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Jeopardy 2.0' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

function isGameRoute(pathname: string) {
  return /^\/sessions\/[^/]+\/(board|play|master)\/?$/.test(pathname)
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setEmail('')
      setDone(false)
      setError('')
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await quickInvite({ data: { email } })
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Spieler einladen" size="sm">
      <div className="px-5 py-5">
        {done ? (
          <div className="text-center py-4 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-good/15 border-2 border-good/30 flex items-center justify-center">
              <Mail className="w-6 h-6 text-good" />
            </div>
            <div>
              <p className="font-bold text-ink-50">Einladung gesendet</p>
              <p className="text-ink-300 text-sm mt-1">
                Eine E-Mail ging an{' '}
                <span className="text-cyan-300 font-semibold">{email}</span>.
              </p>
            </div>
            <Button variant="subtle" onClick={onClose} className="mt-2">
              Schließen
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <FormField label="E-Mail-Adresse" error={error}>
              <Input
                ref={inputRef}
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="email@beispiel.de"
              />
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="ghost" onClick={onClose}>
                Abbrechen
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Wird gesendet…' : 'Einladen'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}

function ConfirmModal({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Bestätigen',
  confirmVariant = 'danger',
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="px-5 py-5 flex flex-col gap-4">
        <p className="text-ink-200 text-sm">{description}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            Abbrechen
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function RootComponent() {
  const location = useLocation()
  const isGame = isGameRoute(location.pathname)

  if (isGame) {
    return (
      <>
        <Outlet />
        <Scripts />
      </>
    )
  }

  return <Chrome />
}

function Chrome() {
  const { data: session, isPending } = authClient.useSession()
  const [showInvite, setShowInvite] = useState(false)
  const [showMasterCloseConfirm, setShowMasterCloseConfirm] = useState(false)
  const [showPlayerLeaveConfirm, setShowPlayerLeaveConfirm] = useState(false)
  const [activeGame, setActiveGame] = useState<{ sessionId: string; isMaster: boolean } | null>(
    null,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    if (!session?.user) {
      setActiveGame(null)
      return
    }
    getActiveGame()
      .then(setActiveGame)
      .catch(() => setActiveGame(null))
  }, [session?.user?.id, location.pathname])

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  function handleLeaveActive() {
    if (!activeGame) return
    if (activeGame.isMaster) {
      setShowMasterCloseConfirm(true)
    } else {
      setShowPlayerLeaveConfirm(true)
    }
  }

  async function handleConfirmMasterClose() {
    if (!activeGame) return
    await leaveSession({ data: { sessionId: activeGame.sessionId } })
    setShowMasterCloseConfirm(false)
    setActiveGame(null)
  }

  async function handleConfirmPlayerLeave() {
    if (!activeGame) return
    await leaveSession({ data: { sessionId: activeGame.sessionId } })
    setShowPlayerLeaveConfirm(false)
    setActiveGame(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-950 text-ink-50">
      <Header
        session={session}
        isPending={isPending}
        activeGame={activeGame}
        onLeaveActive={handleLeaveActive}
        onInvite={() => setShowInvite(true)}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />
      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} />
      <ConfirmModal
        open={showMasterCloseConfirm}
        onCancel={() => setShowMasterCloseConfirm(false)}
        onConfirm={handleConfirmMasterClose}
        title="Quiz beenden?"
        description="Das bestehende Quiz wird für alle Spieler sofort beendet."
        confirmLabel="Beenden"
        confirmVariant="danger"
      />
      <ConfirmModal
        open={showPlayerLeaveConfirm}
        onCancel={() => setShowPlayerLeaveConfirm(false)}
        onConfirm={handleConfirmPlayerLeave}
        title="Session verlassen?"
        description="Möchtest du das laufende Spiel wirklich verlassen?"
        confirmLabel="Verlassen"
        confirmVariant="primary"
      />
      <main className="flex-1 relative">
        <BackgroundDecor />
        <div className="relative z-10">
          <Outlet />
        </div>
      </main>
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
          TanStackQueryDevtools,
        ]}
      />
      <Scripts />
    </div>
  )
}

function BackgroundDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-cyan-500/10 blur-[120px]" />
    </div>
  )
}

interface HeaderProps {
  session: ReturnType<typeof authClient.useSession>['data']
  isPending: boolean
  activeGame: { sessionId: string; isMaster: boolean } | null
  onLeaveActive: () => void | Promise<void>
  onInvite: () => void
  menuOpen: boolean
  setMenuOpen: (v: boolean) => void
}

function Header({
  session,
  isPending,
  activeGame,
  onLeaveActive,
  onInvite,
  menuOpen,
  setMenuOpen,
}: HeaderProps) {
  const user = session?.user
  const isAdmin = (user as { isAdmin?: boolean } | undefined)?.isAdmin

  return (
    <header className="sticky top-0 z-40 bg-bg-950/80 backdrop-blur-xl border-b border-bg-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2 group shrink-0">
          <span className="relative inline-flex w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-cyan-500 items-center justify-center shadow-[var(--shadow-glow-violet)]">
            <Sparkles className="w-4 h-4 text-bg-950" />
          </span>
          <Wordmark size="sm" className="hidden sm:inline" />
        </Link>

        {!isPending && user ? (
          <>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink to="/quizzes" icon={<Library className="w-4 h-4" />}>
                Quizze
              </NavLink>
              <NavLink to="/sessions/new" icon={<Plus className="w-4 h-4" />}>
                Spielen
              </NavLink>
              <NavLink to="/stats" icon={<BarChart3 className="w-4 h-4" />}>
                Statistiken
              </NavLink>
              <button
                type="button"
                onClick={onInvite}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-ink-300 hover:text-ink-50 hover:bg-bg-800 transition-colors"
              >
                <Mail className="w-4 h-4" />
                Einladen
              </button>
              {isAdmin && (
                <>
                  <NavLink to="/admin/invites" icon={<ShieldCheck className="w-4 h-4" />}>
                    Admin
                  </NavLink>
                  <NavLink to="/admin/debug" icon={<FlaskConical className="w-4 h-4" />}>
                    Debug
                  </NavLink>
                </>
              )}
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              {activeGame && <ActiveGamePill activeGame={activeGame} onLeave={onLeaveActive} />}

              <div className="hidden md:flex items-center gap-2">
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-bg-800 hover:bg-bg-700 border border-bg-700 transition-colors"
                  title="Einstellungen"
                >
                  <Avatar name={user.name ?? user.email ?? '?'} size="sm" connected />
                  <span className="text-xs font-semibold text-ink-200 max-w-[8rem] truncate">
                    {user.name}
                  </span>
                </Link>
                <IconButton
                  label="Abmelden"
                  size="md"
                  tone="subtle"
                  onClick={() => void authClient.signOut()}
                >
                  <LogOut className="w-4 h-4" />
                </IconButton>
              </div>

              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl bg-bg-800 border border-bg-700"
                aria-label={menuOpen ? 'Menü schließen' : 'Menü öffnen'}
              >
                {menuOpen ? (
                  <XIcon className="w-4 h-4" />
                ) : (
                  <Avatar name={user.name ?? '?'} size="sm" connected />
                )}
              </button>
            </div>
          </>
        ) : !isPending ? (
          <Link to="/auth/login">
            <Button variant="primary" size="sm">
              Anmelden
            </Button>
          </Link>
        ) : null}
      </div>

      {menuOpen && user && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden border-t border-bg-800 bg-bg-900/95 backdrop-blur-xl"
        >
          <div className="px-4 py-3 flex flex-col gap-1.5">
            <MobileLink to="/quizzes" icon={<Library className="w-4 h-4" />}>
              Meine Quizze
            </MobileLink>
            <MobileLink to="/sessions/new" icon={<Plus className="w-4 h-4" />}>
              Spiel starten
            </MobileLink>
            <MobileLink to="/stats" icon={<BarChart3 className="w-4 h-4" />}>
              Statistiken
            </MobileLink>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                onInvite()
              }}
              className="inline-flex items-center gap-2.5 px-3 h-11 rounded-xl text-ink-200 hover:bg-bg-800 transition-colors text-sm"
            >
              <Mail className="w-4 h-4" />
              Einladen
            </button>
            {isAdmin && (
              <>
                <MobileLink to="/admin/invites" icon={<ShieldCheck className="w-4 h-4" />}>
                  Admin
                </MobileLink>
                <MobileLink to="/admin/debug" icon={<FlaskConical className="w-4 h-4" />}>
                  Debug
                </MobileLink>
              </>
            )}
            <div className="my-1 h-px bg-bg-800" />
            <MobileLink to="/settings" icon={<SettingsIcon className="w-4 h-4" />}>
              Einstellungen
            </MobileLink>
            <button
              type="button"
              onClick={() => void authClient.signOut()}
              className="inline-flex items-center gap-2.5 px-3 h-11 rounded-xl text-bad hover:bg-bad/10 transition-colors text-sm"
            >
              <LogOut className="w-4 h-4" />
              Abmelden
            </button>
          </div>
        </motion.div>
      )}
    </header>
  )
}

function NavLink({
  to,
  icon,
  children,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-xl text-ink-300 hover:text-ink-50 hover:bg-bg-800 transition-colors"
      activeOptions={{ exact: false }}
      activeProps={{ className: 'bg-bg-800 text-ink-50' }}
    >
      {icon}
      {children}
    </Link>
  )
}

function MobileLink({
  to,
  icon,
  children,
}: {
  to: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 px-3 h-11 rounded-xl text-ink-200 hover:bg-bg-800 transition-colors text-sm"
      activeProps={{ className: 'bg-bg-800 text-ink-50 font-semibold' }}
    >
      {icon}
      {children}
    </Link>
  )
}

function ActiveGamePill({
  activeGame,
  onLeave,
}: {
  activeGame: { sessionId: string; isMaster: boolean }
  onLeave: () => void | Promise<void>
}) {
  return (
    <div className="flex items-center rounded-xl border border-good/40 bg-good/10 overflow-hidden">
      <Link
        to={activeGame.isMaster ? '/sessions/$sessionId/master' : '/sessions/$sessionId/play'}
        params={{ sessionId: activeGame.sessionId }}
        className="inline-flex items-center gap-1.5 px-2.5 h-9 text-good hover:bg-good/20 transition-colors text-xs font-bold"
      >
        <Radio className="w-3.5 h-3.5 animate-pulse shrink-0" />
        <span className="hidden sm:inline">Live</span>
      </Link>
      <button
        type="button"
        onClick={onLeave}
        className="inline-flex items-center justify-center w-8 h-9 text-good/70 hover:bg-bad hover:text-white transition-colors"
        title="Session verlassen"
      >
        <XIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>{children}</body>
    </html>
  )
}
