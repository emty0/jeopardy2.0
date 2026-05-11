import { nanoid } from 'nanoid'
import type { GameState, EventNotification, SpecialEventType } from '#/lib/game-state'

/** Zeitfenster (ms) ab Gewinner-Buzz, in dem zweitplatzierte Buzzes als „knapp" zählen. */
export const CLOSE_BUZZ_WINDOW_MS = 500
/** Streak-Schwelle ab der `ON_FIRE` / `COLD_STREAK` triggert (und bei jedem +1 erneut). */
export const STREAK_THRESHOLD = 3
/** AFK-Schwelle: Anzahl Fragen ohne Interaktion. */
export const AFK_THRESHOLD = 4
/** Reaktionszeit unter der ein Buzz als SPEED_DEMON gilt. */
export const SPEED_DEMON_MS = 250
/** Score-Differenz für UNDERDOG (letzter darf max so weit hinten sein). */
export const UNDERDOG_MIN_GAP = 200
/** Score-Differenz für COMEBACK-Schwelle (Vorher mind. so weit hinter Führendem). */
export const COMEBACK_DEFICIT = 1000
/** Comeback gilt als geschafft wenn Differenz unter diesen Wert fällt. */
export const COMEBACK_RECOVERY = 200
/** Anzahl Notifications die im Buffer gehalten werden. */
export const NOTIFICATION_BUFFER_SIZE = 8
/** Max-Alter (ms) bevor eine Notification aus dem State-Buffer fliegt. */
export const NOTIFICATION_TTL_MS = 6000

/** Hängt eine Notification an den Rolling-Buffer an, trimmt alte/überzählige. */
export function pushNotification(
  state: GameState,
  type: SpecialEventType,
  payload: Record<string, unknown>,
): GameState {
  const notif: EventNotification = {
    id: nanoid(8),
    type,
    createdAt: Date.now(),
    payload,
  }
  const cutoff = Date.now() - NOTIFICATION_TTL_MS
  const next = [...state.eventNotifications, notif]
    .filter(n => n.createdAt > cutoff)
    .slice(-NOTIFICATION_BUFFER_SIZE)
  return { ...state, eventNotifications: next }
}

// ─── Detection: BUZZ ────────────────────────────────────────────────────────

interface BuzzRow {
  playerId: string
  buzzedAt: Date
  reactionMs: number | null
}

/**
 * Bei jedem neuen Buzz:
 * - SPEED_DEMON falls reactionMs unter Schwelle
 * - CLOSE_BUZZ falls weitere Buzzes innerhalb 500 ms vor diesem Buzz waren
 *   (der neue Buzzer ist der „Verlierer", die früheren waren schneller)
 *
 * Hinweis: In der State-Machine setzt der ERSTE Buzzer auf JUDGING.
 * Wenn allowRebuzz aktiv ist, kann ein zweiter Spieler aber später noch buzzern
 * (z.B. nach falscher Antwort). Wir behandeln also den jeweils neuen Buzzer
 * als "Verlierer" relativ zum schnellsten bisher.
 */
export function detectBuzzEvents(
  state: GameState,
  newBuzz: BuzzRow,
  allBuzzesForQuestion: BuzzRow[],
): GameState {
  let next = state

  // SPEED_DEMON: nur für den Gewinner-Buzz (= schnellster bisher)
  const fastest = allBuzzesForQuestion
    .slice()
    .sort((a, b) => a.buzzedAt.getTime() - b.buzzedAt.getTime())[0]
  const isWinner = fastest && fastest.playerId === newBuzz.playerId
  if (isWinner && newBuzz.reactionMs !== null && newBuzz.reactionMs >= 0 && newBuzz.reactionMs < SPEED_DEMON_MS) {
    const player = state.players.find(p => p.id === newBuzz.playerId)
    if (player) {
      next = pushNotification(next, 'SPEED_DEMON', {
        playerId: player.id,
        playerName: player.displayName,
        playerColor: player.color,
        reactionMs: newBuzz.reactionMs,
      })
    }
  }

  // CLOSE_BUZZ: zeige für jeden „verpassten" Buzzer die Differenz zum schnellsten
  // Wir emittieren nur einmal pro neuem Buzz, mit einem Array der nahen Konkurrenten.
  if (!isWinner && fastest) {
    const winnerTs = fastest.buzzedAt.getTime()
    const newTs = newBuzz.buzzedAt.getTime()
    const deltaMs = newTs - winnerTs
    if (deltaMs >= 0 && deltaMs <= CLOSE_BUZZ_WINDOW_MS) {
      const losingPlayer = state.players.find(p => p.id === newBuzz.playerId)
      const winningPlayer = state.players.find(p => p.id === fastest.playerId)
      if (losingPlayer && winningPlayer) {
        next = pushNotification(next, 'CLOSE_BUZZ', {
          winnerPlayerId: winningPlayer.id,
          winnerName: winningPlayer.displayName,
          winnerColor: winningPlayer.color,
          loserPlayerId: losingPlayer.id,
          loserName: losingPlayer.displayName,
          loserColor: losingPlayer.color,
          deltaMs,
        })
      }
    }
  }

  return next
}

// ─── Detection: JUDGE ──────────────────────────────────────────────────────

interface JudgeContext {
  playerId: string
  correct: boolean
  /** Streak-Werte VOR diesem Judge (zum Erkennen von STREAK_BROKEN / Schwellen-Übergang). */
  prevCorrectStreak: number
  prevWrongStreak: number
  /** Punktwert der aktuellen Frage. */
  pointValue: number
  /** Gibt es in der Session noch keinen vorherigen korrekten Versuch? (für FIRST_BLOOD) */
  isFirstCorrectInSession: boolean
  /** Score-Stand des Spielers VOR diesem Judge (für COMEBACK-Erkennung). */
  prevScore: number
  /** Punktwert ist der höchste auf dem Board. */
  isHighestPointValue: boolean
  /** Letzter vorheriger Antwortversuch der gleichen Frage war falsch und kam von einem anderen Spieler. */
  prevAttemptOnSameQuestionWasWrongByOther: { playerId: string; playerName: string } | null
}

/**
 * Aktualisiert Streak-Counter auf PlayerState UND emittiert die passenden Notifications.
 * Wird in `JUDGE`-Case aufgerufen NACH dem Score-Update aber VOR finalem return.
 *
 * Wichtig: Skip / noPenaltyApplied bei falscher Antwort soll wrongStreak NICHT erhöhen
 * — das wird vom Caller via `correct=null`-ähnlicher Variante gehandhabt: Wenn
 * `noPenaltyApplied` true ist und `correct` false, übergeben wir einfach `correct: false`
 * trotzdem — denn Spieler hat eine falsche Antwort gegeben, das ist kognitiv „eine Niederlage".
 * Aber: User-Wunsch laut Plan: bei `noPenaltyApplied` wrongStreak unverändert lassen.
 * Daher unten: wenn `noPenaltyApplied` true, ruft Caller `applyJudgeNoPenalty` auf und
 * skippt diese Funktion teilweise. Einfacher: Caller übergibt extra Flag.
 */
export function applyJudgeEffects(
  state: GameState,
  ctx: JudgeContext & { noPenaltyApplied: boolean },
): GameState {
  const { playerId, correct, prevCorrectStreak, prevWrongStreak, noPenaltyApplied } = ctx
  const player = state.players.find(p => p.id === playerId)
  if (!player) return state

  // 1) Streak-Counter aktualisieren
  let newCorrect = prevCorrectStreak
  let newWrong = prevWrongStreak
  if (correct) {
    newCorrect = prevCorrectStreak + 1
    newWrong = 0
  } else if (!noPenaltyApplied) {
    newWrong = prevWrongStreak + 1
    newCorrect = 0
  }
  // bei noPenalty + wrong: beide unverändert (Spieler kassiert keinen Schaden)

  // Bei Interaktion → idleCount = 0
  let next: GameState = {
    ...state,
    players: state.players.map(p =>
      p.id === playerId
        ? { ...p, correctStreak: newCorrect, wrongStreak: newWrong, idleQuestionsCount: 0 }
        : p
    ),
  }

  // 2) Notifications ableiten
  if (correct) {
    // FIRST_BLOOD
    if (ctx.isFirstCorrectInSession) {
      next = pushNotification(next, 'FIRST_BLOOD', {
        playerId: player.id,
        playerName: player.displayName,
        playerColor: player.color,
      })
    }
    // ON_FIRE: ab Schwelle, bei jedem weiteren +1
    if (newCorrect >= STREAK_THRESHOLD) {
      next = pushNotification(next, 'ON_FIRE', {
        playerId: player.id,
        playerName: player.displayName,
        playerColor: player.color,
        streak: newCorrect,
      })
    }
    // BIG_SCORE
    if (ctx.isHighestPointValue) {
      next = pushNotification(next, 'BIG_SCORE', {
        playerId: player.id,
        playerName: player.displayName,
        playerColor: player.color,
        pointValue: ctx.pointValue,
      })
    }
    // ROBBED: vorheriger Versuch derselben Frage war falsch und von einem anderen Spieler
    if (ctx.prevAttemptOnSameQuestionWasWrongByOther) {
      const robbed = ctx.prevAttemptOnSameQuestionWasWrongByOther
      next = pushNotification(next, 'ROBBED', {
        thiefPlayerId: player.id,
        thiefName: player.displayName,
        thiefColor: player.color,
        robbedPlayerId: robbed.playerId,
        robbedName: robbed.playerName,
        pointValue: ctx.pointValue,
      })
    }
    // COMEBACK / UNDERDOG werden separat (post-state) detektiert weil Score-Verhältnisse jetzt aktuell sind
    next = detectScoreEvents(next, ctx.playerId, ctx.prevScore)
  } else {
    // STREAK_BROKEN: war auf ≥ Schwelle, jetzt 0
    if (!noPenaltyApplied && prevCorrectStreak >= STREAK_THRESHOLD) {
      next = pushNotification(next, 'STREAK_BROKEN', {
        playerId: player.id,
        playerName: player.displayName,
        playerColor: player.color,
        finalStreak: prevCorrectStreak,
      })
    }
    // COLD_STREAK: ab Schwelle, bei jedem weiteren +1
    if (!noPenaltyApplied && newWrong >= STREAK_THRESHOLD) {
      next = pushNotification(next, 'COLD_STREAK', {
        playerId: player.id,
        playerName: player.displayName,
        playerColor: player.color,
        streak: newWrong,
      })
    }
  }

  return next
}

/** UNDERDOG / COMEBACK: bewertet Score-Verhältnisse nach einem korrekten Judge. */
function detectScoreEvents(
  state: GameState,
  playerId: string,
  prevScore: number,
): GameState {
  let next = state
  const player = state.players.find(p => p.id === playerId)
  if (!player) return next
  const others = state.players.filter(p => p.id !== playerId && p.userId !== state.masterId)
  if (others.length === 0) return next

  const newScore = player.score
  const leader = state.players
    .filter(p => p.userId !== state.masterId)
    .reduce((a, b) => (a.score > b.score ? a : b))

  // UNDERDOG: dieser Spieler war/ist letzter (vor diesem Punkt war er ganz unten)
  // Heuristik: nimm prev-Stand und prüfe ob er da letzter war + Mindest-Abstand erfüllt war
  const prevScores = state.players
    .filter(p => p.userId !== state.masterId)
    .map(p => (p.id === playerId ? prevScore : p.score))
  const prevMin = Math.min(...prevScores)
  const prevSorted = [...prevScores].sort((a, b) => a - b)
  const prevSecondLowest = prevSorted[1] ?? prevMin
  if (prevScore === prevMin && prevSecondLowest - prevMin >= UNDERDOG_MIN_GAP) {
    next = pushNotification(next, 'UNDERDOG', {
      playerId: player.id,
      playerName: player.displayName,
      playerColor: player.color,
    })
  }

  // COMEBACK: war ≥ COMEBACK_DEFICIT hinter Leader, jetzt < COMEBACK_RECOVERY
  // (verwende für „vorher" den prev-Score und akt. Leader-Score, das ist eine vereinfachte Schätzung)
  const prevDeficit = leader.score - prevScore
  const newDeficit = leader.score - newScore
  if (prevDeficit >= COMEBACK_DEFICIT && newDeficit < COMEBACK_RECOVERY && player.id !== leader.id) {
    next = pushNotification(next, 'COMEBACK', {
      playerId: player.id,
      playerName: player.displayName,
      playerColor: player.color,
    })
  }

  return next
}

// ─── Detection: Question-Close (idle-Berechnung + PERFECT_CATEGORY) ────────

/**
 * Wird aufgerufen wenn eine Frage definitiv abgeschlossen ist:
 * - Korrekter Judge ohne Rapid-Fire-Continue
 * - END_RAPID_FIRE
 * - SKIP_QUESTION
 * - Falscher Judge ohne weitere Buzzer (ANSWER_REVEALED ohne Solver)
 *
 * Inkrementiert idleCount für Nicht-Teilnehmer und resetet für Teilnehmer.
 * Triggert AFK bei Erreichen der Schwelle.
 * Triggert PERFECT_CATEGORY wenn die zugehörige Kategorie jetzt komplett gelöst ist.
 */
export function onQuestionClosed(
  state: GameState,
  participantPlayerIds: Set<string>,
  closedQuestionId: string,
): GameState {
  let next: GameState = {
    ...state,
    players: state.players.map(p => {
      if (p.userId === state.masterId) return p
      const participated = participantPlayerIds.has(p.id)
      return {
        ...p,
        idleQuestionsCount: participated ? 0 : p.idleQuestionsCount + 1,
      }
    }),
  }

  // AFK: nur bei genau Erreichen der Schwelle, damit es nicht jede Frage erneut feuert
  for (const p of next.players) {
    if (p.userId === state.masterId) continue
    if (!p.isConnected) continue
    if (p.idleQuestionsCount === AFK_THRESHOLD) {
      next = pushNotification(next, 'AFK', {
        playerId: p.id,
        playerName: p.displayName,
        playerColor: p.color,
        idleCount: p.idleQuestionsCount,
      })
    }
  }

  // PERFECT_CATEGORY: prüfe Kategorie der gerade geschlossenen Frage
  const cat = next.board.find(c => c.questions.some(q => q.id === closedQuestionId))
  if (cat) {
    const realQuestions = cat.questions.filter(q => !q.empty)
    const allAnswered = realQuestions.length > 0 && realQuestions.every(q => q.answered)
    const allSolved = realQuestions.every(q => q.solverColors.length > 0)
    if (allAnswered && allSolved) {
      next = pushNotification(next, 'PERFECT_CATEGORY', {
        categoryId: cat.id,
        categoryName: cat.name,
      })
    }
  }

  return next
}
