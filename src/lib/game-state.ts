import { db } from '#/db/index'
import { gameSession, gamePlayer, question, questionMedia, category, quiz, answeredQuestion, buzzLog, questionAttempt, gameEvent, questionReveal } from '#/db/schema'
import { eq, and, asc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { detectBuzzEvents, applyJudgeEffects, onQuestionClosed } from '#/lib/specialEvents'

export type GamePhase =
  | 'LOBBY'
  | 'SELECTING'
  | 'QUESTION_PREVIEW'
  | 'QUESTION_OPEN'
  | 'BUZZING'
  | 'JUDGING'
  | 'ANSWER_REVEALED'
  | 'GAME_OVER'
  | 'SESSION_CLOSED'

export interface BoardQuestion {
  id: string
  pointValue: number
  answered: boolean
  /** Colors of players who answered correctly, in chronological order (outside-to-inside on the tile). Empty if skipped or empty placeholder. */
  solverColors: string[]
  /** True if this slot has no question defined (placeholder). */
  empty?: boolean
}

export interface BoardCategory {
  id: string
  name: string
  questions: BoardQuestion[]
}

export type MediaRole = 'question' | 'answer'

export interface MediaItem {
  id: string
  url: string
  type: string // 'image' | 'audio' | 'video' | 'youtube'
  role: MediaRole
  sortOrder: number
}

export interface ActiveQuestion {
  id: string
  categoryName: string
  pointValue: number
  questionText: string
  answerText: string
  mediaUrl: string | null
  mediaType: string | null
  youtubeUrl: string | null
  mediaItems: MediaItem[]
  allowRebuzz: boolean
  autoplayMedia: boolean
  rapidFire: boolean
  showMediaOnPlayer: boolean
  mediaPlaceholder: boolean
}

export interface PlayerState {
  id: string
  displayName: string
  score: number
  isConnected: boolean
  userId: string | null
  color: string
  /** Aktuelle Serie korrekt beantworteter Fragen in Folge. Reset bei falscher Antwort. */
  correctStreak: number
  /** Aktuelle Serie falsch beantworteter Fragen in Folge. Reset bei korrekter Antwort. */
  wrongStreak: number
  /** Anzahl beantworteter Fragen seit der letzten Interaktion (Buzz / Skip-Vote / Frage-Auswahl). */
  idleQuestionsCount: number
}

export interface PendingJoiner {
  userId: string
  displayName: string
  requestedAt: number
}

export type SpecialEventType =
  | 'CLOSE_BUZZ'
  | 'ON_FIRE'
  | 'COLD_STREAK'
  | 'AFK'
  | 'STREAK_BROKEN'
  | 'FIRST_BLOOD'
  | 'UNDERDOG'
  | 'COMEBACK'
  | 'SPEED_DEMON'
  | 'BIG_SCORE'
  | 'ROBBED'
  | 'PERFECT_CATEGORY'

export interface EventNotification {
  id: string
  type: SpecialEventType
  createdAt: number
  payload: Record<string, unknown>
}

export interface GameState {
  sessionId: string
  phase: GamePhase
  masterId: string
  players: PlayerState[]
  activePlayerId: string | null
  activeQuestion: ActiveQuestion | null
  buzzedPlayerId: string | null
  answeredQuestionIds: string[]
  buzzedPlayerIds: string[]
  board: BoardCategory[]
  winnerId: string | null
  pointValues: number[]
  wrongAnswerPenalty: number
  noNegativePoints: boolean
  skipVotes: string[]
  rapidFireSolvedIds: string[]
  revealedMediaIndex: number
  pendingJoiners: PendingJoiner[]
  /** Rolling Buffer der letzten Spezial-Events (max 8, älter als 6s wird verworfen). */
  eventNotifications: EventNotification[]
}

export const gameStateMap = new Map<string, GameState>()
export const pendingJoinMap = new Map<string, PendingJoiner[]>()

// Broadcast-Registry: Der WS-Handler registriert hier seine Publish-Fn,
// damit Server-Fns (z.B. Late-Join-Anfragen) State-Updates aktiv pushen können.
let broadcastImpl: ((sessionId: string, state: GameState) => void) | null = null
export function registerBroadcast(fn: (sessionId: string, state: GameState) => void) {
  broadcastImpl = fn
  // Globalen Fallback setzen (wichtig wenn game-state.ts in mehreren Bundles geladen wird)
  ;(globalThis as Record<string, unknown>).__jeopardyBroadcast = fn
}
export async function broadcastState(sessionId: string) {
  gameStateMap.delete(sessionId)
  const state = await loadGameState(sessionId)
  const impl =
    broadcastImpl ??
    ((globalThis as Record<string, unknown>).__jeopardyBroadcast as
      | ((sessionId: string, state: GameState) => void)
      | undefined) ??
    null
  if (state && impl) impl(sessionId, state)
}

// ─── Stats-Hilfsstrukturen (nicht im broadcasteten State) ─────────────────────
const seqCounters = new Map<string, number>()
const questionRevealedAtMap = new Map<string, number>() // sessionId -> ms timestamp
/** Set aller Spieler-IDs, die in der aktuellen Frage interagiert haben (Buzz, Skip-Vote, Auswahl). */
const currentQuestionParticipants = new Map<string, Set<string>>() // sessionId -> Set<playerId>

function markParticipant(sessionId: string, playerId: string) {
  const set = currentQuestionParticipants.get(sessionId) ?? new Set<string>()
  set.add(playerId)
  currentQuestionParticipants.set(sessionId, set)
}

export function addPendingJoiner(sessionId: string, joiner: PendingJoiner) {
  const list = pendingJoinMap.get(sessionId) ?? []
  if (list.some(p => p.userId === joiner.userId)) return
  pendingJoinMap.set(sessionId, [...list, joiner])
  const state = gameStateMap.get(sessionId)
  if (state) {
    gameStateMap.set(sessionId, { ...state, pendingJoiners: pendingJoinMap.get(sessionId)! })
  }
}

export function removePendingJoiner(sessionId: string, userId: string) {
  const list = pendingJoinMap.get(sessionId) ?? []
  const next = list.filter(p => p.userId !== userId)
  pendingJoinMap.set(sessionId, next)
  const state = gameStateMap.get(sessionId)
  if (state) {
    gameStateMap.set(sessionId, { ...state, pendingJoiners: next })
  }
}

/**
 * Säubere die Session-Mitgliedschaft eines Users (für Konflikt-Auflösung beim
 * Wechsel auf eine andere Session). Master ⇒ Session als finished markieren,
 * sonst gamePlayer-Zeile löschen. In-Memory-State invalidieren.
 */
export async function cleanupSessionForUser(userId: string, sessionId: string) {
  const gs = await db.select().from(gameSession).where(eq(gameSession.id, sessionId)).get()
  if (!gs) return
  if (gs.masterId === userId) {
    await db
      .update(gameSession)
      .set({ status: 'finished', finishedAt: new Date() })
      .where(eq(gameSession.id, sessionId))
  } else {
    await db
      .delete(gamePlayer)
      .where(and(eq(gamePlayer.sessionId, sessionId), eq(gamePlayer.userId, userId)))
  }
  gameStateMap.delete(sessionId)
  pendingJoinMap.delete(sessionId)
}

interface LogEventOpts {
  type: string
  actorPlayerId?: string | null
  actorUserId?: string | null
  questionId?: string | null
  payload?: Record<string, unknown>
}

async function logEvent(sessionId: string, opts: LogEventOpts) {
  const seq = (seqCounters.get(sessionId) ?? 0) + 1
  seqCounters.set(sessionId, seq)
  try {
    await db.insert(gameEvent).values({
      id: nanoid(10),
      sessionId,
      seq,
      type: opts.type,
      actorPlayerId: opts.actorPlayerId ?? null,
      actorUserId: opts.actorUserId ?? null,
      questionId: opts.questionId ?? null,
      payload: JSON.stringify(opts.payload ?? {}),
    })
  } catch (e) {
    console.error('logEvent fail:', opts.type, e)
  }
}

/** Schreibt jede neu emittierte EventNotification ins Audit-Log. */
async function persistNewNotifications(sessionId: string, before: GameState, after: GameState) {
  const beforeIds = new Set(before.eventNotifications.map(n => n.id))
  const fresh = after.eventNotifications.filter(n => !beforeIds.has(n.id))
  for (const n of fresh) {
    await logEvent(sessionId, {
      type: 'SPECIAL_EVENT',
      payload: { specialType: n.type, ...n.payload },
    })
  }
}

function getMasterUserId(state: GameState): string {
  return state.masterId
}

export async function loadGameState(sessionId: string): Promise<GameState | null> {
  const gs = await db.select().from(gameSession).where(eq(gameSession.id, sessionId)).get()
  if (!gs) return null

  const q = await db.select().from(quiz).where(eq(quiz.id, gs.quizId)).get()
  if (!q) return null

  const pointValues: number[] = JSON.parse(q.pointValues)

  const players = await db.select().from(gamePlayer).where(eq(gamePlayer.sessionId, sessionId)).all()

  const categories = await db.select().from(category).where(eq(category.quizId, gs.quizId)).orderBy(category.columnIndex).all()

  const questions = await db.select().from(question).where(eq(question.quizId, gs.quizId)).all()

  const answered = await db.select().from(answeredQuestion).where(eq(answeredQuestion.sessionId, sessionId)).all()
  const answeredIds = answered.map(a => a.questionId)

  // Korrekte Antwort-Versuche pro Frage chronologisch — für Solver-Farben auf dem Board
  const correctAttempts = await db
    .select()
    .from(questionAttempt)
    .where(and(eq(questionAttempt.sessionId, sessionId), eq(questionAttempt.isCorrect, true)))
    .orderBy(asc(questionAttempt.resolvedAt))
    .all()
  const playerColorById = new Map(players.map(p => [p.id, p.color]))
  const solversByQuestionId = new Map<string, string[]>()
  for (const att of correctAttempts) {
    const color = playerColorById.get(att.playerId)
    if (!color) continue
    const arr = solversByQuestionId.get(att.questionId) ?? []
    arr.push(color)
    solversByQuestionId.set(att.questionId, arr)
  }

  const board: BoardCategory[] = categories.map(cat => {
    const catQuestions = questions.filter(qq => qq.categoryId === cat.id)
    const slots: BoardQuestion[] = []
    for (let row = 0; row < q.rowCount; row++) {
      const found = catQuestions.find(qq => qq.rowIndex === row)
      const pointValue = pointValues[row] ?? (row + 1) * 100
      if (found) {
        slots.push({
          id: found.id,
          pointValue,
          answered: answeredIds.includes(found.id),
          solverColors: solversByQuestionId.get(found.id) ?? [],
        })
      } else {
        slots.push({
          id: `empty-${cat.id}-${row}`,
          pointValue,
          answered: true,
          solverColors: [],
          empty: true,
        })
      }
    }
    return { id: cat.id, name: cat.name, questions: slots }
  })

  // ─── Streak- & Idle-Rekonstruktion aus DB-History (für Server-Restart-Resilienz) ──
  const allAttempts = await db.select().from(questionAttempt)
    .where(eq(questionAttempt.sessionId, sessionId))
    .orderBy(asc(questionAttempt.resolvedAt))
    .all()
  const allBuzzes = await db.select().from(buzzLog)
    .where(eq(buzzLog.sessionId, sessionId))
    .all()

  // participantsByQuestion: questionId -> Set<playerId> (alle die gebuzzert oder geantwortet haben)
  const participantsByQuestion = new Map<string, Set<string>>()
  for (const b of allBuzzes) {
    if (!participantsByQuestion.has(b.questionId)) participantsByQuestion.set(b.questionId, new Set())
    participantsByQuestion.get(b.questionId)!.add(b.playerId)
  }
  for (const a of allAttempts) {
    if (!participantsByQuestion.has(a.questionId)) participantsByQuestion.set(a.questionId, new Set())
    participantsByQuestion.get(a.questionId)!.add(a.playerId)
  }

  // attemptsByPlayer: chronologisch sortiert pro Spieler
  const attemptsByPlayer = new Map<string, typeof allAttempts>()
  for (const att of allAttempts) {
    if (!attemptsByPlayer.has(att.playerId)) attemptsByPlayer.set(att.playerId, [])
    attemptsByPlayer.get(att.playerId)!.push(att)
  }

  // answered chronologisch sortiert (für idle-Berechnung)
  const answeredOrdered = [...answered].sort(
    (a, b) => (a.solvedAt instanceof Date ? a.solvedAt.getTime() : 0) - (b.solvedAt instanceof Date ? b.solvedAt.getTime() : 0)
  )

  function computeStreaks(playerId: string): { correctStreak: number; wrongStreak: number } {
    const list = attemptsByPlayer.get(playerId) ?? []
    let correct = 0
    let wrong = 0
    for (const a of list) {
      if (a.isCorrect === true) { correct++; wrong = 0 }
      else if (a.isCorrect === false) { wrong++; correct = 0 }
    }
    return { correctStreak: correct, wrongStreak: wrong }
  }

  function computeIdle(playerId: string): number {
    let idle = 0
    for (const aq of answeredOrdered) {
      const set = participantsByQuestion.get(aq.questionId)
      if (set?.has(playerId)) idle = 0
      else idle++
    }
    return idle
  }

  const state: GameState = {
    sessionId,
    phase: gs.currentState as GamePhase,
    masterId: gs.masterId,
    players: players.map(p => {
      const { correctStreak, wrongStreak } = computeStreaks(p.id)
      return {
        id: p.id,
        displayName: p.displayName,
        score: p.score,
        isConnected: p.isConnected,
        userId: p.userId,
        color: p.color,
        correctStreak,
        wrongStreak,
        idleQuestionsCount: computeIdle(p.id),
      }
    }),
    activePlayerId: gs.activePlayerId,
    activeQuestion: null,
    buzzedPlayerId: null,
    answeredQuestionIds: answeredIds,
    buzzedPlayerIds: [],
    board,
    winnerId: gs.winnerPlayerId,
    pointValues,
    wrongAnswerPenalty: q.wrongAnswerPenalty,
    noNegativePoints: false,
    skipVotes: [],
    rapidFireSolvedIds: [],
    revealedMediaIndex: -1,
    pendingJoiners: pendingJoinMap.get(sessionId) ?? [],
    eventNotifications: [],
  }

  if (gs.activeQuestionId) {
    const aq = questions.find(q => q.id === gs.activeQuestionId)
    if (aq) {
      const cat = categories.find(c => c.id === aq.categoryId)
      const mediaRows = await db.select().from(questionMedia).where(eq(questionMedia.questionId, aq.id)).orderBy(asc(questionMedia.sortOrder)).all()
      const mediaItems: MediaItem[] = mediaRows.length > 0 ? mediaRows.map(m => ({ ...m, role: (m.role as MediaRole) ?? 'question' })) : [
        ...(aq.youtubeUrl ? [{ id: 'yt', url: aq.youtubeUrl, type: 'youtube', role: 'question' as MediaRole, sortOrder: 0 }] : []),
        ...(aq.mediaUrl ? [{ id: 'ml', url: aq.mediaUrl, type: aq.mediaType ?? 'image', role: 'question' as MediaRole, sortOrder: 1 }] : []),
      ]
      state.activeQuestion = {
        id: aq.id,
        categoryName: cat?.name ?? '',
        pointValue: pointValues[aq.rowIndex] ?? (aq.rowIndex + 1) * 100,
        questionText: aq.questionText,
        answerText: aq.answerText,
        mediaUrl: aq.mediaUrl,
        mediaType: aq.mediaType,
        youtubeUrl: aq.youtubeUrl,
        mediaItems,
        allowRebuzz: aq.allowRebuzz,
        autoplayMedia: aq.autoplayMedia,
        rapidFire: aq.rapidFire,
        showMediaOnPlayer: aq.showMediaOnPlayer,
        mediaPlaceholder: aq.mediaPlaceholder,
      }

      // questionRevealedAt für Reaktionszeit-Berechnung (auch nach Server-Restart)
      const reveal = await db.select().from(questionReveal)
        .where(and(eq(questionReveal.sessionId, sessionId), eq(questionReveal.questionId, gs.activeQuestionId)))
        .get()
      if (reveal?.revealedAt) {
        const ts = reveal.revealedAt instanceof Date ? reveal.revealedAt.getTime() : Number(reveal.revealedAt) * 1000
        questionRevealedAtMap.set(sessionId, ts)
      }
    }
    const buzzes = await db.select().from(buzzLog)
      .where(and(eq(buzzLog.sessionId, sessionId), eq(buzzLog.questionId, gs.activeQuestionId)))
      .all()
    state.buzzedPlayerIds = buzzes.map(b => b.playerId)
  }

  // Seq-Counter aus DB initialisieren
  const seqRow = await db.select({ c: count() }).from(gameEvent).where(eq(gameEvent.sessionId, sessionId)).get()
  seqCounters.set(sessionId, seqRow?.c ?? 0)

  gameStateMap.set(sessionId, state)
  return state
}

function findUserIdByPlayerId(state: GameState, playerId: string | null | undefined): string | null {
  if (!playerId) return null
  return state.players.find(p => p.id === playerId)?.userId ?? null
}

export async function applyEvent(
  sessionId: string,
  event: { type: string; payload: Record<string, unknown> },
): Promise<GameState | null> {
  let state = gameStateMap.get(sessionId) ?? await loadGameState(sessionId)
  if (!state) return null
  if (state.phase === 'SESSION_CLOSED') return state

  const { type, payload } = event

  switch (type) {
    case 'START_GAME': {
      if (state.phase !== 'LOBBY') break
      const nonMasterPlayers = state.players.filter(p => p.userId !== state!.masterId)
      if (nonMasterPlayers.length === 0) break
      const randomIdx = Math.floor(Math.random() * nonMasterPlayers.length)
      const firstPlayer = nonMasterPlayers[randomIdx]
      state = { ...state, phase: 'SELECTING', activePlayerId: firstPlayer.id }
      const totalQs = state.board.reduce((acc, c) => acc + c.questions.filter(q => !q.empty).length, 0)
      await db.update(gameSession).set({
        currentState: 'SELECTING',
        activePlayerId: firstPlayer.id,
        status: 'active',
        startedAt: new Date(),
        totalQuestions: totalQs,
      }).where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'START_GAME',
        actorUserId: getMasterUserId(state),
        payload: { firstPlayerId: firstPlayer.id, totalQuestions: totalQs, playerCount: nonMasterPlayers.length },
      })
      break
    }

    case 'SELECT_QUESTION': {
      if (state.phase !== 'SELECTING') break
      const qId = payload.questionId as string
      const allQuestions = state.board.flatMap(c => c.questions)
      const boardQ = allQuestions.find(q => q.id === qId)
      if (!boardQ || boardQ.answered) break

      // Participant-Set für die neue Frage zurücksetzen und Auswählenden eintragen
      currentQuestionParticipants.set(sessionId, new Set())
      if (state.activePlayerId) {
        markParticipant(sessionId, state.activePlayerId)
      }

      const aq = await db.select().from(question).where(eq(question.id, qId)).get()
      if (!aq) break
      const cat = state.board.find(c => c.questions.some(q => q.id === qId))
      const mediaRows = await db.select().from(questionMedia).where(eq(questionMedia.questionId, qId)).orderBy(asc(questionMedia.sortOrder)).all()
      const mediaItems: MediaItem[] = mediaRows.length > 0 ? mediaRows.map(m => ({ ...m, role: (m.role as MediaRole) ?? 'question' })) : [
        ...(aq.youtubeUrl ? [{ id: 'yt', url: aq.youtubeUrl, type: 'youtube', role: 'question' as MediaRole, sortOrder: 0 }] : []),
        ...(aq.mediaUrl ? [{ id: 'ml', url: aq.mediaUrl, type: aq.mediaType ?? 'image', role: 'question' as MediaRole, sortOrder: 1 }] : []),
      ]
      state = {
        ...state,
        phase: 'QUESTION_PREVIEW',
        activeQuestion: {
          id: aq.id,
          categoryName: cat?.name ?? '',
          pointValue: boardQ.pointValue,
          questionText: aq.questionText,
          answerText: aq.answerText,
          mediaUrl: aq.mediaUrl,
          mediaType: aq.mediaType,
          youtubeUrl: aq.youtubeUrl,
          mediaItems,
          allowRebuzz: aq.allowRebuzz,
          autoplayMedia: aq.autoplayMedia,
          rapidFire: aq.rapidFire,
          showMediaOnPlayer: aq.showMediaOnPlayer,
          mediaPlaceholder: aq.mediaPlaceholder,
        },
        buzzedPlayerId: null,
        buzzedPlayerIds: [],
        noNegativePoints: false,
        skipVotes: [],
        rapidFireSolvedIds: [],
        revealedMediaIndex: -1,
      }
      questionRevealedAtMap.delete(sessionId) // wird beim START_QUESTION neu gesetzt
      await db.update(gameSession).set({ currentState: 'QUESTION_PREVIEW', activeQuestionId: qId }).where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'SELECT_QUESTION',
        actorUserId: getMasterUserId(state),
        questionId: qId,
        payload: { pointValue: boardQ.pointValue, categoryName: cat?.name },
      })
      break
    }

    case 'START_QUESTION': {
      if (state.phase !== 'QUESTION_PREVIEW') break
      if (!state.activeQuestion) break
      const aqId = state.activeQuestion.id
      state = { ...state, phase: 'QUESTION_OPEN', buzzedPlayerId: null, buzzedPlayerIds: [] }
      const revealedAt = new Date()
      questionRevealedAtMap.set(sessionId, revealedAt.getTime())
      await db.update(gameSession).set({ currentState: 'QUESTION_OPEN' }).where(eq(gameSession.id, sessionId))
      await db.insert(questionReveal).values({
        sessionId,
        questionId: aqId,
        revealedAt,
      }).onConflictDoNothing()
      await logEvent(sessionId, {
        type: 'START_QUESTION',
        actorUserId: getMasterUserId(state),
        questionId: aqId,
        payload: { revealedAt: revealedAt.getTime() },
      })
      break
    }

    case 'BUZZ': {
      if (state.phase !== 'QUESTION_OPEN') break
      if (!state.activeQuestion) break
      const aq = state.activeQuestion
      const playerId = payload.playerId as string
      const player = state.players.find(p => p.id === playerId)
      if (!player) break
      if (player.userId === state.masterId) break
      const alreadyBuzzed = state.buzzedPlayerIds.includes(playerId)
      if (alreadyBuzzed && !aq.allowRebuzz) break
      if (state.rapidFireSolvedIds.includes(playerId)) break

      const buzzedAt = new Date()
      const revealedTs = questionRevealedAtMap.get(sessionId)
      const reactionMs = revealedTs ? buzzedAt.getTime() - revealedTs : null

      await db.insert(buzzLog).values({
        sessionId,
        questionId: aq.id,
        playerId,
        buzzedAt,
        revealedAt: revealedTs ? new Date(revealedTs) : null,
        reactionMs,
      }).onConflictDoNothing()

      // Teilnehmer-Tracking für AFK-Detection
      markParticipant(sessionId, playerId)

      state = {
        ...state,
        phase: 'JUDGING',
        buzzedPlayerId: playerId,
        buzzedPlayerIds: [...new Set([...state.buzzedPlayerIds, playerId])],
      }
      await db.update(gameSession).set({ currentState: 'JUDGING' }).where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'BUZZ',
        actorPlayerId: playerId,
        actorUserId: player.userId,
        questionId: aq.id,
        payload: { reactionMs, revealedMediaIndex: state.revealedMediaIndex, attemptOrderHint: state.buzzedPlayerIds.length },
      })

      // Spezial-Events: SPEED_DEMON / CLOSE_BUZZ
      const allBuzzes = await db.select().from(buzzLog)
        .where(and(eq(buzzLog.sessionId, sessionId), eq(buzzLog.questionId, aq.id)))
        .all()
      const buzzRows = allBuzzes
        .filter(b => b.buzzedAt instanceof Date)
        .map(b => ({
          playerId: b.playerId,
          buzzedAt: b.buzzedAt as Date,
          reactionMs: b.reactionMs,
        }))
      const newBuzzRow = { playerId, buzzedAt, reactionMs }
      const before = state
      state = detectBuzzEvents(state, newBuzzRow, buzzRows)
      await persistNewNotifications(sessionId, before, state)
      break
    }

    case 'JUDGE': {
      if (state.phase !== 'JUDGING') break
      if (!state.activeQuestion || !state.buzzedPlayerId) break
      const correct = payload.correct as boolean
      const closeQuestion = payload.closeQuestion !== false // default true
      const buzzedPlayerId = state.buzzedPlayerId
      const activeQuestion = state.activeQuestion
      const buzzedPlayer = state.players.find(p => p.id === buzzedPlayerId)
      if (!buzzedPlayer) break

      const pointValue = activeQuestion.pointValue
      const noPenaltyApplied = state.noNegativePoints
      const delta = correct ? pointValue : (noPenaltyApplied ? 0 : -Math.round(pointValue * state.wrongAnswerPenalty))
      const newScore = buzzedPlayer.score + delta

      // ─── Snapshots VOR Mutation für Spezial-Event-Detection ──
      const prevCorrectStreak = buzzedPlayer.correctStreak
      const prevWrongStreak = buzzedPlayer.wrongStreak
      const prevScore = buzzedPlayer.score
      const isHighestPointValue = pointValue === Math.max(...state.pointValues)
      // FIRST_BLOOD: gibt es bisher NULL korrekte Antworten in der Session?
      const prevCorrectCountRow = await db.select({ c: count() }).from(questionAttempt)
        .where(and(eq(questionAttempt.sessionId, sessionId), eq(questionAttempt.isCorrect, true)))
        .get()
      const isFirstCorrectInSession = correct && (prevCorrectCountRow?.c ?? 0) === 0
      // ROBBED: vorheriger Versuch der GLEICHEN Frage war falsch UND von einem anderen Spieler
      let prevAttemptOnSameQuestionWasWrongByOther: { playerId: string; playerName: string } | null = null
      if (correct) {
        const lastAttemptOnQuestion = await db.select().from(questionAttempt)
          .where(and(
            eq(questionAttempt.sessionId, sessionId),
            eq(questionAttempt.questionId, activeQuestion.id),
          ))
          .orderBy(asc(questionAttempt.resolvedAt))
          .all()
        const lastWrong = [...lastAttemptOnQuestion].reverse().find(a => a.isCorrect === false)
        if (lastWrong && lastWrong.playerId !== buzzedPlayerId) {
          const robbed = state.players.find(p => p.id === lastWrong.playerId)
          if (robbed) {
            prevAttemptOnSameQuestionWasWrongByOther = { playerId: robbed.id, playerName: robbed.displayName }
          }
        }
      }

      // Reaktionszeit aus buzzLog (bereits gespeichert)
      const buzzRow = await db.select().from(buzzLog)
        .where(and(eq(buzzLog.sessionId, sessionId), eq(buzzLog.questionId, activeQuestion.id), eq(buzzLog.playerId, buzzedPlayerId)))
        .get()
      const reactionMs = buzzRow?.reactionMs ?? null

      // attemptOrder = wievielter Versuch insgesamt auf diese Frage
      const prevAttempts = await db.select({ c: count() }).from(questionAttempt)
        .where(and(eq(questionAttempt.sessionId, sessionId), eq(questionAttempt.questionId, activeQuestion.id)))
        .get()
      const attemptOrder = (prevAttempts?.c ?? 0) + 1

      await db.update(gamePlayer).set({ score: newScore }).where(eq(gamePlayer.id, buzzedPlayerId))
      await db.insert(questionAttempt).values({
        id: nanoid(10),
        sessionId,
        questionId: activeQuestion.id,
        playerId: buzzedPlayerId,
        isCorrect: correct,
        pointsAwarded: delta,
        buzzedAt: buzzRow?.buzzedAt ?? new Date(),
        resolvedAt: new Date(),
        attemptOrder,
        noPenaltyApplied,
        wasRapidFire: activeQuestion.rapidFire,
        revealedMediaIndexAtBuzz: state.revealedMediaIndex,
        reactionMs,
      })

      await logEvent(sessionId, {
        type: 'JUDGE',
        actorUserId: getMasterUserId(state),
        questionId: activeQuestion.id,
        payload: {
          buzzedPlayerId,
          buzzedUserId: buzzedPlayer.userId,
          correct,
          pointsAwarded: delta,
          newScore,
          noPenaltyApplied,
          wasRapidFire: activeQuestion.rapidFire,
          closeQuestion,
          attemptOrder,
          reactionMs,
        },
      })

      state = {
        ...state,
        players: state.players.map(p =>
          p.id === buzzedPlayerId ? { ...p, score: newScore } : p
        ),
      }

      // Solver-Farben auf dem Board live nachziehen (für TV-Anzeige)
      const appendSolverColor = (board: BoardCategory[]) => board.map(c => ({
        ...c,
        questions: c.questions.map(q =>
          q.id === activeQuestion.id && correct
            ? { ...q, solverColors: [...q.solverColors, buzzedPlayer.color] }
            : q
        ),
      }))

      if (correct && activeQuestion.rapidFire && !closeQuestion) {
        // Rapid-fire: award points, go back to QUESTION_OPEN — master chose "Zurück zur Frage"
        const newSolvedIds = [...state.rapidFireSolvedIds, buzzedPlayerId]
        state = {
          ...state,
          phase: 'QUESTION_OPEN',
          buzzedPlayerId: null,
          rapidFireSolvedIds: newSolvedIds,
          board: appendSolverColor(state.board),
        }
        await db.update(gameSession).set({ currentState: 'QUESTION_OPEN' }).where(eq(gameSession.id, sessionId))
      } else if (correct) {
        // Existierenden answeredQuestion-Eintrag aktualisieren (firstSolver = der erste richtige) — sonst neu
        const existing = await db.select().from(answeredQuestion)
          .where(and(eq(answeredQuestion.sessionId, sessionId), eq(answeredQuestion.questionId, activeQuestion.id)))
          .get()
        if (existing) {
          await db.update(answeredQuestion).set({
            resolution: 'solved',
            solvedAt: new Date(),
            firstSolverPlayerId: existing.firstSolverPlayerId ?? buzzedPlayerId,
          }).where(and(eq(answeredQuestion.sessionId, sessionId), eq(answeredQuestion.questionId, activeQuestion.id)))
        } else {
          await db.insert(answeredQuestion).values({
            sessionId,
            questionId: activeQuestion.id,
            resolution: 'solved',
            solvedAt: new Date(),
            firstSolverPlayerId: buzzedPlayerId,
          }).onConflictDoNothing()
        }
        const newAnswered = [...state.answeredQuestionIds, activeQuestion.id]
        const newBoard = appendSolverColor(state.board).map(c => ({
          ...c,
          questions: c.questions.map(q => q.id === activeQuestion.id ? { ...q, answered: true } : q),
        }))
        const allAnswered = newBoard.every(c => c.questions.every(q => q.answered))
        const newPhase: GamePhase = allAnswered ? 'GAME_OVER' : 'ANSWER_REVEALED'
        const winnerId = allAnswered
          ? state.players.filter(p => p.userId !== state!.masterId).reduce((a, b) => a.score > b.score ? a : b, state.players.filter(p => p.userId !== state!.masterId)[0] ?? state.players[0]).id
          : null

        state = {
          ...state,
          phase: newPhase,
          activePlayerId: buzzedPlayerId,
          answeredQuestionIds: newAnswered,
          board: newBoard,
          buzzedPlayerId: null,
          winnerId,
        }
        await db.update(gameSession).set({
          currentState: newPhase,
          activePlayerId: buzzedPlayerId,
          status: allAnswered ? 'finished' : 'active',
          answeredCount: newAnswered.length,
          ...(allAnswered ? { winnerPlayerId: winnerId, finishedAt: new Date() } : {}),
        }).where(eq(gameSession.id, sessionId))
        if (allAnswered) {
          await logEvent(sessionId, {
            type: 'GAME_OVER',
            payload: { winnerPlayerId: winnerId, finalScores: state.players.map(p => ({ playerId: p.id, userId: p.userId, score: p.score })) },
          })
        }
      } else {
        const remainingPlayers = state.players.filter(p =>
          p.userId !== state!.masterId &&
          (!activeQuestion.allowRebuzz ? !state!.buzzedPlayerIds.includes(p.id) : true)
        )
        const newPhase: GamePhase = remainingPlayers.length > 0 ? 'QUESTION_OPEN' : 'ANSWER_REVEALED'
        state = { ...state, phase: newPhase, buzzedPlayerId: null }
        await db.update(gameSession).set({ currentState: newPhase }).where(eq(gameSession.id, sessionId))
      }

      // ─── Spezial-Event-Detection: Streaks, ON_FIRE, COLD_STREAK, ROBBED, etc. ──
      const beforeJudgeEffects = state
      state = applyJudgeEffects(state, {
        playerId: buzzedPlayerId,
        correct,
        prevCorrectStreak,
        prevWrongStreak,
        pointValue,
        isFirstCorrectInSession,
        prevScore,
        isHighestPointValue,
        prevAttemptOnSameQuestionWasWrongByOther,
        noPenaltyApplied,
      })
      await persistNewNotifications(sessionId, beforeJudgeEffects, state)

      // ─── Wenn die Frage definitiv geschlossen ist: idle-Counter & PERFECT_CATEGORY ──
      const questionClosed = state.phase === 'ANSWER_REVEALED' || state.phase === 'GAME_OVER'
      if (questionClosed) {
        const participants = currentQuestionParticipants.get(sessionId) ?? new Set<string>()
        const beforeClose = state
        state = onQuestionClosed(state, participants, activeQuestion.id)
        await persistNewNotifications(sessionId, beforeClose, state)
        currentQuestionParticipants.delete(sessionId)
      }
      break
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'ANSWER_REVEALED') break
      const prevQId = state.activeQuestion?.id ?? null
      state = { ...state, phase: 'SELECTING', activeQuestion: null, buzzedPlayerId: null, buzzedPlayerIds: [], noNegativePoints: false, skipVotes: [], rapidFireSolvedIds: [] }
      questionRevealedAtMap.delete(sessionId)
      await db.update(gameSession).set({ currentState: 'SELECTING', activeQuestionId: null }).where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'NEXT_ROUND',
        actorUserId: getMasterUserId(state),
        questionId: prevQId,
      })
      break
    }

    case 'END_RAPID_FIRE': {
      if (!state.activeQuestion?.rapidFire) break
      if (state.phase !== 'QUESTION_OPEN' && state.phase !== 'JUDGING') break
      const qId = state.activeQuestion.id
      const solvers = [...state.rapidFireSolvedIds]
      // erster Solver für firstSolverPlayerId
      const firstCorrect = await db.select().from(questionAttempt)
        .where(and(eq(questionAttempt.sessionId, sessionId), eq(questionAttempt.questionId, qId), eq(questionAttempt.isCorrect, true)))
        .orderBy(asc(questionAttempt.resolvedAt))
        .get()
      await db.insert(answeredQuestion).values({
        sessionId,
        questionId: qId,
        resolution: 'rapid_fire',
        solvedAt: new Date(),
        firstSolverPlayerId: firstCorrect?.playerId ?? null,
      }).onConflictDoNothing()
      const newBoard = state.board.map(c => ({
        ...c,
        questions: c.questions.map(q => q.id === qId ? { ...q, answered: true } : q),
      }))
      const newAnswered = [...state.answeredQuestionIds, qId]
      const allAnswered = newBoard.every(c => c.questions.every(q => q.answered))
      const newPhase: GamePhase = allAnswered ? 'GAME_OVER' : 'ANSWER_REVEALED'
      const winnerId = allAnswered
        ? state.players.filter(p => p.userId !== state!.masterId).reduce((a, b) => a.score > b.score ? a : b, state.players.filter(p => p.userId !== state!.masterId)[0] ?? state.players[0]).id
        : null
      state = { ...state, phase: newPhase, board: newBoard, answeredQuestionIds: newAnswered, buzzedPlayerId: null, winnerId }
      await db.update(gameSession).set({
        currentState: newPhase,
        status: allAnswered ? 'finished' : 'active',
        answeredCount: newAnswered.length,
        ...(allAnswered ? { winnerPlayerId: winnerId, finishedAt: new Date() } : {}),
      }).where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'END_RAPID_FIRE',
        actorUserId: getMasterUserId(state),
        questionId: qId,
        payload: { solverPlayerIds: solvers },
      })
      if (allAnswered) {
        await logEvent(sessionId, {
          type: 'GAME_OVER',
          payload: { winnerPlayerId: winnerId, finalScores: state.players.map(p => ({ playerId: p.id, userId: p.userId, score: p.score })) },
        })
      }
      // ─── Question-Closed: idle-Counter & PERFECT_CATEGORY ──
      {
        const participants = currentQuestionParticipants.get(sessionId) ?? new Set<string>()
        const beforeClose = state
        state = onQuestionClosed(state, participants, qId)
        await persistNewNotifications(sessionId, beforeClose, state)
        currentQuestionParticipants.delete(sessionId)
      }
      break
    }

    case 'REVEAL_NEXT_MEDIA': {
      if (state.phase !== 'QUESTION_OPEN' && state.phase !== 'JUDGING') break
      if (!state.activeQuestion) break
      const aqId = state.activeQuestion.id
      const questionMediaCount = state.activeQuestion.mediaItems.filter(m => m.role === 'question').length
      const maxIndex = questionMediaCount - 1
      if (state.revealedMediaIndex >= maxIndex) break
      state = { ...state, revealedMediaIndex: state.revealedMediaIndex + 1 }
      await logEvent(sessionId, {
        type: 'REVEAL_NEXT_MEDIA',
        actorUserId: getMasterUserId(state),
        questionId: aqId,
        payload: { revealedMediaIndex: state.revealedMediaIndex },
      })
      break
    }

    case 'TOGGLE_NO_PENALTY': {
      if (state.phase !== 'QUESTION_OPEN' && state.phase !== 'JUDGING') break
      state = { ...state, noNegativePoints: !state.noNegativePoints }
      await logEvent(sessionId, {
        type: 'TOGGLE_NO_PENALTY',
        actorUserId: getMasterUserId(state),
        questionId: state.activeQuestion?.id ?? null,
        payload: { noNegativePoints: state.noNegativePoints },
      })
      break
    }

    case 'SKIP_QUESTION': {
      if (state.phase !== 'QUESTION_OPEN' && state.phase !== 'JUDGING' && state.phase !== 'QUESTION_PREVIEW') break
      if (!state.activeQuestion) break
      const skippedId = state.activeQuestion.id
      await db.insert(answeredQuestion).values({
        sessionId,
        questionId: skippedId,
        resolution: 'skipped',
      }).onConflictDoNothing()
      const newBoard = state.board.map(c => ({
        ...c,
        questions: c.questions.map(q => q.id === skippedId ? { ...q, answered: true } : q),
      }))
      const newAnswered = [...state.answeredQuestionIds, skippedId]
      const allAnswered = newBoard.every(c => c.questions.every(q => q.answered))
      const newPhase: GamePhase = allAnswered ? 'GAME_OVER' : 'SELECTING'
      const winnerId = allAnswered
        ? state.players.filter(p => p.userId !== state!.masterId).reduce((a, b) => a.score > b.score ? a : b, state.players.filter(p => p.userId !== state!.masterId)[0] ?? state.players[0]).id
        : null
      state = {
        ...state,
        phase: newPhase,
        activeQuestion: null,
        buzzedPlayerId: null,
        buzzedPlayerIds: [],
        noNegativePoints: false,
        skipVotes: [],
        board: newBoard,
        answeredQuestionIds: newAnswered,
        winnerId,
      }
      questionRevealedAtMap.delete(sessionId)
      await db.update(gameSession).set({
        currentState: newPhase,
        activeQuestionId: null,
        status: allAnswered ? 'finished' : 'active',
        answeredCount: newAnswered.length,
        ...(allAnswered ? { winnerPlayerId: winnerId, finishedAt: new Date() } : {}),
      }).where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'SKIP_QUESTION',
        actorUserId: getMasterUserId(state),
        questionId: skippedId,
      })
      if (allAnswered) {
        await logEvent(sessionId, {
          type: 'GAME_OVER',
          payload: { winnerPlayerId: winnerId, finalScores: state.players.map(p => ({ playerId: p.id, userId: p.userId, score: p.score })) },
        })
      }
      // ─── Question-Closed: idle-Counter (Skip = niemand-hat-teilgenommen-Effekt für Idler) ──
      {
        const participants = currentQuestionParticipants.get(sessionId) ?? new Set<string>()
        const beforeClose = state
        state = onQuestionClosed(state, participants, skippedId)
        await persistNewNotifications(sessionId, beforeClose, state)
        currentQuestionParticipants.delete(sessionId)
      }
      break
    }

    case 'VOTE_SKIP': {
      if (state.phase !== 'QUESTION_OPEN') break
      const voterId = payload.playerId as string
      if (state.skipVotes.includes(voterId)) break
      markParticipant(sessionId, voterId)
      const newVotes = [...state.skipVotes, voterId]
      const masterId = state.masterId
      const nonMasterConnected = state.players.filter(p => p.userId !== masterId && p.isConnected)
      const allVoted = nonMasterConnected.length > 0 && nonMasterConnected.every(p => newVotes.includes(p.id))
      await logEvent(sessionId, {
        type: 'VOTE_SKIP',
        actorPlayerId: voterId,
        actorUserId: findUserIdByPlayerId(state, voterId),
        questionId: state.activeQuestion?.id ?? null,
        payload: { votes: newVotes.length, totalNeeded: nonMasterConnected.length },
      })
      if (allVoted) {
        // Trigger auto-skip
        state = { ...state, skipVotes: newVotes }
        gameStateMap.set(sessionId, state)
        return applyEvent(sessionId, { type: 'SKIP_QUESTION', payload: {} })
      }
      state = { ...state, skipVotes: newVotes }
      break
    }

    case 'ADMIT_PENDING_JOIN': {
      const userId = payload.userId as string
      const list = pendingJoinMap.get(sessionId) ?? []
      const pending = list.find(p => p.userId === userId)
      if (!pending) break
      // Falls userId schon ein Spieler ist (Race-Condition) → nur aus pending entfernen
      const alreadyPlayer = state.players.some(p => p.userId === userId)
      if (!alreadyPlayer) {
        const { pickPlayerColor } = await import('#/lib/playerColors')
        const usedColors = state.players.map(p => p.color)
        const color = pickPlayerColor(usedColors, userId)
        const newPlayerId = nanoid(10)
        await db.insert(gamePlayer).values({
          id: newPlayerId,
          sessionId,
          userId,
          displayName: pending.displayName,
          score: 0,
          isConnected: true,
          color,
        })
        await logEvent(sessionId, {
          type: 'ADMIT_PLAYER',
          actorUserId: getMasterUserId(state),
          payload: { admittedUserId: userId, playerId: newPlayerId },
        })
      }
      pendingJoinMap.set(sessionId, list.filter(p => p.userId !== userId))
      // Force-Reload damit neuer Spieler im State erscheint
      gameStateMap.delete(sessionId)
      state = (await loadGameState(sessionId))!
      break
    }

    case 'REJECT_PENDING_JOIN': {
      const userId = payload.userId as string
      const list = pendingJoinMap.get(sessionId) ?? []
      const next = list.filter(p => p.userId !== userId)
      pendingJoinMap.set(sessionId, next)
      state = { ...state, pendingJoiners: next }
      await logEvent(sessionId, {
        type: 'REJECT_PLAYER',
        actorUserId: getMasterUserId(state),
        payload: { rejectedUserId: userId },
      })
      break
    }

    case 'PLAYER_CONNECTED': {
      const playerId = payload.playerId as string
      state = { ...state, players: state.players.map(p => p.id === playerId ? { ...p, isConnected: true } : p) }
      await db.update(gamePlayer).set({ isConnected: true }).where(eq(gamePlayer.id, playerId))
      await logEvent(sessionId, {
        type: 'PLAYER_CONNECTED',
        actorPlayerId: playerId,
        actorUserId: findUserIdByPlayerId(state, playerId),
      })
      break
    }

    case 'ADJUST_SCORE': {
      const playerId = payload.playerId as string
      const delta = payload.delta as number
      if (typeof delta !== 'number' || !Number.isFinite(delta) || delta === 0) break
      const player = state.players.find(p => p.id === playerId)
      if (!player) break
      const newScore = player.score + delta
      await db.update(gamePlayer).set({ score: newScore }).where(eq(gamePlayer.id, playerId))
      state = {
        ...state,
        players: state.players.map(p => p.id === playerId ? { ...p, score: newScore } : p),
      }
      await logEvent(sessionId, {
        type: 'ADJUST_SCORE',
        actorUserId: getMasterUserId(state),
        actorPlayerId: playerId,
        payload: { delta, newScore, previousScore: player.score },
      })
      break
    }

    case 'CLOSE_SESSION': {
      state = { ...state, phase: 'SESSION_CLOSED' }
      await db.update(gameSession)
        .set({ status: 'finished', currentState: 'SESSION_CLOSED', finishedAt: new Date() })
        .where(eq(gameSession.id, sessionId))
      await logEvent(sessionId, {
        type: 'CLOSE_SESSION',
        actorUserId: getMasterUserId(state),
      })
      break
    }

    case 'PLAYER_DISCONNECTED': {
      const playerId = payload.playerId as string
      state = { ...state, players: state.players.map(p => p.id === playerId ? { ...p, isConnected: false } : p) }
      await db.update(gamePlayer).set({ isConnected: false }).where(eq(gamePlayer.id, playerId))
      await logEvent(sessionId, {
        type: 'PLAYER_DISCONNECTED',
        actorPlayerId: playerId,
        actorUserId: findUserIdByPlayerId(state, playerId),
      })
      break
    }
  }

  gameStateMap.set(sessionId, state)
  return state
}
