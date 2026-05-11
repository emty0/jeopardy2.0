import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Flame, Snowflake, Moon, Bell, Droplet,
  Dog, TrendingUp, Zap, Gem, Ghost, Trophy, HeartCrack,
} from 'lucide-react'
import type { EventNotification, GameState, SpecialEventType } from '#/lib/game-state'

/** Wie lange jede Notification sichtbar bleibt (clientseitiges Auto-Hide, ms). */
const DISPLAY_DURATION_MS = 4000

type Surface = 'tv' | 'master' | 'player'

interface Props {
  state: GameState
  surface: Surface
  /** Bei surface='player' der Spieler, dessen Phone das ist (für personalisierte Filter). */
  selfPlayerId?: string | null
  /** Wenn true: Wrapper sind `absolute` statt `fixed`, damit Overlay sich auf Container beschränkt (Debug-Preview). */
  containerMode?: boolean
  /** Wenn false: keine Sounds — für Debug-Preview default off. Default: true für TV. */
  enableSound?: boolean
}

/** Sound-Mapping für TV-Surface. */
const SOUND_MAP: Partial<Record<SpecialEventType, string>> = {
  ON_FIRE: '/sounds/events/on-fire.mp3',
  STREAK_BROKEN: '/sounds/events/on-fire.mp3',
  SPEED_DEMON: '/sounds/events/on-fire.mp3',
  BIG_SCORE: '/sounds/events/on-fire.mp3',
  COLD_STREAK: '/sounds/events/cold.mp3',
  AFK: '/sounds/events/snore.mp3',
  CLOSE_BUZZ: '/sounds/events/chime.mp3',
  FIRST_BLOOD: '/sounds/events/chime.mp3',
  UNDERDOG: '/sounds/events/chime.mp3',
  COMEBACK: '/sounds/events/chime.mp3',
  ROBBED: '/sounds/events/chime.mp3',
  PERFECT_CATEGORY: '/sounds/events/chime.mp3',
}

/** Welche Events sieht welche Surface? Master sieht nur das Nötigste, Player nur Persönliches. */
function isVisibleOnSurface(n: EventNotification, surface: Surface, selfPlayerId: string | null): boolean {
  if (surface === 'tv') return true

  if (surface === 'master') {
    return n.type === 'CLOSE_BUZZ' || n.type === 'AFK'
  }

  // surface === 'player' — personalisierte Filterung
  if (!selfPlayerId) return false
  const p = n.payload as Record<string, unknown>
  const involvedIds = [
    p.playerId,
    p.winnerPlayerId,
    p.loserPlayerId,
    p.thiefPlayerId,
    p.robbedPlayerId,
  ].filter((v): v is string => typeof v === 'string')
  return involvedIds.includes(selfPlayerId)
}

export function EventNotificationOverlay({
  state,
  surface,
  selfPlayerId = null,
  containerMode = false,
  enableSound,
}: Props) {
  const soundOn = enableSound ?? !containerMode
  const posClass = containerMode ? 'absolute' : 'fixed'
  const [visible, setVisible] = useState<EventNotification[]>([])
  const seenIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    const fresh: EventNotification[] = []
    for (const n of state.eventNotifications) {
      if (seenIds.current.has(n.id)) continue
      seenIds.current.add(n.id)
      if (!isVisibleOnSurface(n, surface, selfPlayerId)) continue
      fresh.push(n)
    }
    if (fresh.length === 0) return

    setVisible(prev => [...prev, ...fresh])

    // TV: Sound abspielen (gated via enableSound)
    if (surface === 'tv' && soundOn) {
      for (const n of fresh) {
        const src = SOUND_MAP[n.type]
        if (!src) continue
        try {
          const a = new Audio(src)
          a.volume = 0.6
          a.play().catch(() => {})
        } catch {}
      }
    }

    // Auto-Hide
    for (const n of fresh) {
      setTimeout(() => {
        setVisible(prev => prev.filter(x => x.id !== n.id))
      }, DISPLAY_DURATION_MS)
    }
  }, [state.eventNotifications, surface, selfPlayerId, soundOn])

  // Master-Surface: kompakte Toasts oben rechts (unter Header) — kleiner Stack
  if (surface === 'master') {
    return (
      <div className={`pointer-events-none ${posClass} ${containerMode ? 'top-3 right-3' : 'top-[5.5rem] right-3'} z-30 flex flex-col gap-1.5 max-w-[18rem]`}>
        <AnimatePresence>
          {visible.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <CompactToast n={n} surface={surface} selfPlayerId={selfPlayerId} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    )
  }

  // Player-Surface: schmale Toasts oben mittig
  if (surface === 'player') {
    return (
      <div className={`pointer-events-none ${posClass} ${containerMode ? 'top-3' : 'top-20'} left-1/2 -translate-x-1/2 z-30 flex flex-col gap-1.5 w-[min(22rem,90vw)]`}>
        <AnimatePresence>
          {visible.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <CompactToast n={n} surface={surface} selfPlayerId={selfPlayerId} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    )
  }

  // TV-Surface: große Banner mittig + Stack unten für CLOSE_BUZZ/AFK
  return (
    <div className={`pointer-events-none ${posClass} inset-0 z-30`}>
      {/* Hero-Banner: zeigt nur die NEUESTE „große" Notification mittig */}
      <AnimatePresence mode="popLayout">
        {(() => {
          const hero = [...visible].reverse().find(n => isHeroEvent(n.type))
          if (!hero) return null
          return (
            <motion.div
              key={hero.id}
              initial={{ opacity: 0, y: -30, scale: 0.85 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 380, damping: 24 }}
              className="absolute top-[14%] left-1/2 -translate-x-1/2 w-auto"
            >
              <HeroBanner n={hero} />
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* Kompakter Stack unten links für CLOSE_BUZZ / AFK / sekundäres */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-2 max-w-md">
        <AnimatePresence>
          {visible
            .filter(n => !isHeroEvent(n.type))
            .map(n => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ type: 'spring', stiffness: 380, damping: 24 }}
              >
                <CompactToast n={n} surface={surface} selfPlayerId={selfPlayerId} />
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Welche Event-Typen bekommen das große Hero-Banner auf TV. */
function isHeroEvent(type: SpecialEventType): boolean {
  return (
    type === 'ON_FIRE' ||
    type === 'COLD_STREAK' ||
    type === 'STREAK_BROKEN' ||
    type === 'FIRST_BLOOD' ||
    type === 'BIG_SCORE' ||
    type === 'PERFECT_CATEGORY' ||
    type === 'COMEBACK' ||
    type === 'UNDERDOG'
  )
}

// ─── Hero-Banner (TV) ──────────────────────────────────────────────────────

function HeroBanner({ n }: { n: EventNotification }) {
  const p = n.payload as Record<string, unknown>
  const playerName = (p.playerName as string) ?? ''
  const playerColor = (p.playerColor as string) ?? '#7C3AED'

  switch (n.type) {
    case 'ON_FIRE': {
      const streak = p.streak as number
      return (
        <div
          className="fx-banner-slam relative px-10 py-6 rounded-2xl border-4 flex items-center gap-5"
          style={{
            background: `linear-gradient(135deg, ${playerColor}33, ${playerColor}11)`,
            borderColor: playerColor,
            boxShadow: `0 0 0 4px rgba(245,158,11,0.35), 0 24px 48px -8px ${playerColor}88, 0 0 60px 8px rgba(239,68,68,0.4)`,
          }}
        >
          <span className="fx-flame-flicker">
            <Flame className="w-16 h-16 text-amber-400" fill="currentColor" />
          </span>
          <div className="text-left">
            <p className="font-board uppercase tracking-[0.2em] text-amber-300 text-lg leading-none">
              {playerName}
            </p>
            <p className="font-board uppercase text-5xl leading-tight" style={{ color: 'white' }}>
              IS ON FIRE!
            </p>
            <p className="text-ink-200 text-sm tracking-wider mt-1">
              {streak} Fragen in Folge richtig
            </p>
          </div>
          <span className="fx-flame-flicker">
            <Flame className="w-16 h-16 text-amber-400" fill="currentColor" />
          </span>
        </div>
      )
    }
    case 'COLD_STREAK': {
      const streak = p.streak as number
      return (
        <div className="fx-banner-slam fx-frost-ring relative px-10 py-6 rounded-2xl border-4 border-cyan-400 bg-gradient-to-br from-cyan-500/20 to-blue-700/20 flex items-center gap-5"
          style={{ boxShadow: '0 0 0 4px rgba(96,165,250,0.4), 0 24px 48px -8px rgba(125,211,252,0.6)' }}>
          <Snowflake className="w-14 h-14 text-cyan-200" />
          <div className="text-left">
            <p className="font-board uppercase tracking-[0.2em] text-cyan-200 text-lg leading-none">
              {playerName}
            </p>
            <p className="font-board uppercase text-5xl leading-tight text-white">
              friert ein!
            </p>
            <p className="text-cyan-100 text-sm tracking-wider mt-1">
              {streak} Fragen in Folge daneben
            </p>
          </div>
          <Snowflake className="w-14 h-14 text-cyan-200" />
        </div>
      )
    }
    case 'STREAK_BROKEN': {
      const finalStreak = p.finalStreak as number
      return (
        <div className="fx-banner-slam fx-shake px-8 py-5 rounded-2xl border-2 border-bad bg-bad/20 backdrop-blur-md flex items-center gap-4">
          <HeartCrack className="w-12 h-12 text-bad" />
          <div className="text-left">
            <p className="font-board uppercase text-3xl text-white">Streak gebrochen!</p>
            <p className="text-ink-200 text-sm mt-0.5">
              {playerName} verliert seine {finalStreak}er-Serie
            </p>
          </div>
        </div>
      )
    }
    case 'FIRST_BLOOD':
      return (
        <div className="fx-banner-slam px-8 py-5 rounded-2xl border-2 border-red-500 bg-red-900/30 backdrop-blur-md flex items-center gap-4">
          <Droplet className="w-12 h-12 text-red-400" fill="currentColor" />
          <div className="text-left">
            <p className="font-board uppercase text-4xl text-white">First Blood!</p>
            <p className="text-ink-200 text-sm mt-0.5">
              {playerName} knackt die erste Frage
            </p>
          </div>
        </div>
      )
    case 'BIG_SCORE': {
      const pointValue = p.pointValue as number
      return (
        <div className="fx-banner-slam px-8 py-5 rounded-2xl border-2 border-amber-400 bg-amber-500/20 backdrop-blur-md flex items-center gap-4"
          style={{ boxShadow: 'var(--shadow-glow-amber)' }}>
          <Gem className="w-12 h-12 text-amber-300" />
          <div className="text-left">
            <p className="font-board uppercase text-3xl text-white">Großer Coup!</p>
            <p className="text-ink-100 text-sm mt-0.5">
              {playerName} knackt die {pointValue.toLocaleString('de-DE')}
            </p>
          </div>
        </div>
      )
    }
    case 'PERFECT_CATEGORY': {
      const categoryName = p.categoryName as string
      return (
        <div className="fx-banner-slam px-8 py-5 rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-500/30 to-violet-600/20 backdrop-blur-md flex items-center gap-4">
          <Trophy className="w-12 h-12 text-amber-300" />
          <div className="text-left">
            <p className="font-board uppercase text-3xl text-white">Kategorie geknackt!</p>
            <p className="text-ink-100 text-sm mt-0.5">{categoryName}</p>
          </div>
        </div>
      )
    }
    case 'COMEBACK':
      return (
        <div className="fx-banner-slam px-8 py-5 rounded-2xl border-2 border-violet-400 bg-violet-500/20 backdrop-blur-md flex items-center gap-4">
          <TrendingUp className="w-12 h-12 text-violet-300" />
          <div className="text-left">
            <p className="font-board uppercase text-3xl text-white">Comeback Kid!</p>
            <p className="text-ink-100 text-sm mt-0.5">
              {playerName} ist wieder im Rennen
            </p>
          </div>
        </div>
      )
    case 'UNDERDOG':
      return (
        <div className="fx-banner-slam px-8 py-5 rounded-2xl border-2 border-cyan-400 bg-cyan-500/20 backdrop-blur-md flex items-center gap-4">
          <Dog className="w-12 h-12 text-cyan-300" />
          <div className="text-left">
            <p className="font-board uppercase text-3xl text-white">Underdog!</p>
            <p className="text-ink-100 text-sm mt-0.5">
              {playerName} kämpft sich zurück
            </p>
          </div>
        </div>
      )
    default:
      return null
  }
}

// ─── Kompakte Toasts (für CLOSE_BUZZ, AFK, SPEED_DEMON, ROBBED + Master/Player-Surfaces) ────

function CompactToast({
  n,
  surface,
  selfPlayerId,
}: {
  n: EventNotification
  surface: Surface
  selfPlayerId: string | null
}) {
  const p = n.payload as Record<string, unknown>
  const isPlayerSurface = surface === 'player'

  switch (n.type) {
    case 'CLOSE_BUZZ': {
      const winnerName = (p.winnerName as string) ?? '?'
      const loserName = (p.loserName as string) ?? '?'
      const loserId = p.loserPlayerId as string | undefined
      const deltaMs = p.deltaMs as number
      const youAreLoser = isPlayerSurface && selfPlayerId && loserId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-bg-900/95 border-2 border-bad/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Bell className="w-5 h-5 text-bad shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-bad font-bold">Knapp daneben</p>
            <p className="text-ink-100 text-sm font-semibold truncate">
              {youAreLoser ? `Du um ${deltaMs} ms` : `${loserName} um ${deltaMs} ms`}{' '}
              <span className="text-ink-400">verpasst</span>
            </p>
            <p className="text-ink-500 text-[11px] truncate">
              {winnerName} war schneller
            </p>
          </div>
        </div>
      )
    }
    case 'AFK': {
      const playerName = (p.playerName as string) ?? '?'
      const playerId = p.playerId as string | undefined
      const youAreAfk = isPlayerSurface && selfPlayerId && playerId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/50 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Moon className="w-5 h-5 text-amber-300 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300 font-bold">
              {youAreAfk ? 'Aufwachen!' : 'Schläft'}
            </p>
            <p className="text-ink-100 text-sm font-semibold truncate">
              {youAreAfk ? 'Du dösst seit 4 Fragen vor dich hin 💤' : `${playerName} schläft seit 4 Fragen 💤`}
            </p>
          </div>
        </div>
      )
    }
    case 'SPEED_DEMON': {
      const playerName = (p.playerName as string) ?? '?'
      const playerId = p.playerId as string | undefined
      const reactionMs = p.reactionMs as number
      const youDidIt = isPlayerSurface && selfPlayerId && playerId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-cyan-500/15 border-2 border-cyan-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Zap className="w-5 h-5 text-cyan-300 shrink-0" fill="currentColor" />
          <div className="text-left min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300 font-bold">Lichtgeschwindigkeit</p>
            <p className="text-ink-100 text-sm font-semibold truncate">
              {youDidIt ? 'Du' : playerName} in {reactionMs} ms gebuzzert
            </p>
          </div>
        </div>
      )
    }
    case 'ROBBED': {
      const thiefName = (p.thiefName as string) ?? '?'
      const robbedName = (p.robbedName as string) ?? '?'
      const thiefId = p.thiefPlayerId as string | undefined
      const robbedId = p.robbedPlayerId as string | undefined
      const youGotRobbed = isPlayerSurface && selfPlayerId && robbedId === selfPlayerId
      const youAreThief = isPlayerSurface && selfPlayerId && thiefId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-violet-500/15 border-2 border-violet-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg fx-shake">
          <Ghost className="w-5 h-5 text-violet-300 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-300 font-bold">Geklaut!</p>
            <p className="text-ink-100 text-sm font-semibold truncate">
              {youAreThief ? `Du klaust ${robbedName} die Punkte` :
                youGotRobbed ? `${thiefName} klaut dir die Punkte` :
                `${thiefName} schnappt ${robbedName} die Punkte weg`}
            </p>
          </div>
        </div>
      )
    }
    // Auf Player-Surface auch die „großen" Events kompakt zeigen — personalisiert
    case 'ON_FIRE': {
      const streak = p.streak as number
      const playerId = p.playerId as string | undefined
      const youOnFire = isPlayerSurface && selfPlayerId && playerId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Flame className="w-5 h-5 text-amber-400 fx-flame-flicker shrink-0" fill="currentColor" />
          <p className="text-ink-100 text-sm font-bold">
            {youOnFire ? `Du bist ON FIRE! (${streak} in Folge)` : `${String(p.playerName ?? '')} ist on fire (${streak})`}
          </p>
        </div>
      )
    }
    case 'COLD_STREAK': {
      const streak = p.streak as number
      const playerId = p.playerId as string | undefined
      const youColdStreak = isPlayerSurface && selfPlayerId && playerId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-cyan-500/15 border-2 border-cyan-400/50 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Snowflake className="w-5 h-5 text-cyan-200 shrink-0" />
          <p className="text-ink-100 text-sm font-bold">
            {youColdStreak ? `Du frierst ein! (${streak} daneben)` : `${String(p.playerName ?? '')} friert ein (${streak})`}
          </p>
        </div>
      )
    }
    case 'STREAK_BROKEN': {
      const finalStreak = p.finalStreak as number
      const playerId = p.playerId as string | undefined
      const youBroke = isPlayerSurface && selfPlayerId && playerId === selfPlayerId
      return (
        <div className="px-4 py-2.5 rounded-xl bg-bad/15 border-2 border-bad/60 backdrop-blur-md flex items-center gap-3 shadow-lg fx-shake">
          <HeartCrack className="w-5 h-5 text-bad shrink-0" />
          <p className="text-ink-100 text-sm font-bold">
            {youBroke ? `Deine ${finalStreak}er-Streak ist gebrochen` : `${String(p.playerName ?? '')}: Streak ${finalStreak} weg`}
          </p>
        </div>
      )
    }
    case 'FIRST_BLOOD':
      return (
        <div className="px-4 py-2.5 rounded-xl bg-red-900/40 border-2 border-red-500/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Droplet className="w-5 h-5 text-red-400 shrink-0" fill="currentColor" />
          <p className="text-ink-100 text-sm font-bold">First Blood — {String(p.playerName ?? '')}</p>
        </div>
      )
    case 'BIG_SCORE':
      return (
        <div className="px-4 py-2.5 rounded-xl bg-amber-500/15 border-2 border-amber-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Gem className="w-5 h-5 text-amber-300 shrink-0" />
          <p className="text-ink-100 text-sm font-bold">Großer Coup — {String(p.playerName ?? '')}</p>
        </div>
      )
    case 'PERFECT_CATEGORY':
      return (
        <div className="px-4 py-2.5 rounded-xl bg-violet-500/15 border-2 border-violet-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
          <p className="text-ink-100 text-sm font-bold">Kategorie geknackt: {String(p.categoryName ?? '')}</p>
        </div>
      )
    case 'COMEBACK':
      return (
        <div className="px-4 py-2.5 rounded-xl bg-violet-500/15 border-2 border-violet-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <TrendingUp className="w-5 h-5 text-violet-300 shrink-0" />
          <p className="text-ink-100 text-sm font-bold">Comeback — {String(p.playerName ?? '')}</p>
        </div>
      )
    case 'UNDERDOG':
      return (
        <div className="px-4 py-2.5 rounded-xl bg-cyan-500/15 border-2 border-cyan-400/60 backdrop-blur-md flex items-center gap-3 shadow-lg">
          <Dog className="w-5 h-5 text-cyan-300 shrink-0" />
          <p className="text-ink-100 text-sm font-bold">Underdog — {String(p.playerName ?? '')}</p>
        </div>
      )
    default:
      return null
  }
}
