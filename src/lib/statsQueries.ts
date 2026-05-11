/**
 * Server-only Aggregat-Queries für Stats / Hall of Fame / Recap.
 * Nur aus createServerFn-Handlern oder anderen Server-Modulen importieren.
 */
import { db } from '#/db/index'
import {
  gameSession, gamePlayer, questionAttempt, buzzLog, answeredQuestion,
  question, category, quiz, user, questionMedia,
} from '#/db/schema'
import { eq, and, desc, asc, sql, inArray, isNotNull, count } from 'drizzle-orm'

// ─── Career ───────────────────────────────────────────────────────────────────

export async function getCareerStats(userId: string) {
  const u = await db.select().from(user).where(eq(user.id, userId)).get()
  if (!u) return null

  const myPlayers = await db.select({ id: gamePlayer.id, sessionId: gamePlayer.sessionId })
    .from(gamePlayer).where(eq(gamePlayer.userId, userId)).all()
  const playerIds = myPlayers.map(p => p.id)
  const sessionIds = [...new Set(myPlayers.map(p => p.sessionId))]

  if (playerIds.length === 0) {
    return {
      user: { id: u.id, name: u.name, displayUsername: u.displayUsername, image: u.image },
      gamesPlayed: 0, gamesWon: 0, winRate: 0,
      totalCorrect: 0, totalWrong: 0, accuracy: 0,
      avgReactionMs: null, fastestBuzzMs: null, slowestBuzzMs: null,
      totalPointsEarned: 0, totalPointsLost: 0, netPoints: 0,
      favoriteCategory: null, longestCorrectStreak: 0,
      buzzCount: 0,
    }
  }

  // Spiele gespielt (status finished, in denen User mitgespielt hat — exkl. Master-Only-Sessions)
  const sessions = await db.select().from(gameSession)
    .where(and(inArray(gameSession.id, sessionIds), eq(gameSession.status, 'finished')))
    .all()
  const winSessions = sessions.filter(s => s.winnerPlayerId && playerIds.includes(s.winnerPlayerId))

  // Attempts
  const attempts = await db.select().from(questionAttempt)
    .where(inArray(questionAttempt.playerId, playerIds))
    .orderBy(asc(questionAttempt.resolvedAt))
    .all()
  const correct = attempts.filter(a => a.isCorrect).length
  const wrong = attempts.filter(a => a.isCorrect === false).length
  const accuracy = (correct + wrong) > 0 ? correct / (correct + wrong) : 0
  const totalEarned = attempts.filter(a => a.pointsAwarded > 0).reduce((s, a) => s + a.pointsAwarded, 0)
  const totalLost = attempts.filter(a => a.pointsAwarded < 0).reduce((s, a) => s + Math.abs(a.pointsAwarded), 0)

  // Reaktionszeiten
  const buzzes = await db.select().from(buzzLog)
    .where(inArray(buzzLog.playerId, playerIds))
    .all()
  const reactions = buzzes.map(b => b.reactionMs).filter((x): x is number => typeof x === 'number' && x > 0)
  const avgReactionMs = reactions.length ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length) : null
  const fastestBuzzMs = reactions.length ? Math.min(...reactions) : null
  const slowestBuzzMs = reactions.length ? Math.max(...reactions) : null

  // Lieblings-Kategorie (höchste Anzahl korrekter Antworten)
  let favoriteCategory: { name: string; correct: number } | null = null
  if (correct > 0) {
    const correctQuestionIds = attempts.filter(a => a.isCorrect).map(a => a.questionId)
    if (correctQuestionIds.length > 0) {
      const rows = await db
        .select({ name: category.name, c: count() })
        .from(question)
        .innerJoin(category, eq(question.categoryId, category.id))
        .where(inArray(question.id, correctQuestionIds))
        .groupBy(category.name)
        .orderBy(desc(count()))
        .limit(1)
        .all()
      if (rows[0]) favoriteCategory = { name: rows[0].name, correct: Number(rows[0].c) }
    }
  }

  // Längste Streak (in Folge richtig — über alle Sessions chronologisch)
  let longestStreak = 0
  let curStreak = 0
  for (const a of attempts) {
    if (a.isCorrect) {
      curStreak++
      if (curStreak > longestStreak) longestStreak = curStreak
    } else if (a.isCorrect === false) {
      curStreak = 0
    }
  }

  return {
    user: { id: u.id, name: u.name, displayUsername: u.displayUsername, image: u.image },
    gamesPlayed: sessions.length,
    gamesWon: winSessions.length,
    winRate: sessions.length > 0 ? winSessions.length / sessions.length : 0,
    totalCorrect: correct,
    totalWrong: wrong,
    accuracy,
    avgReactionMs,
    fastestBuzzMs,
    slowestBuzzMs,
    totalPointsEarned: totalEarned,
    totalPointsLost: totalLost,
    netPoints: totalEarned - totalLost,
    favoriteCategory,
    longestCorrectStreak: longestStreak,
    buzzCount: buzzes.length,
  }
}

// ─── Session Recap ────────────────────────────────────────────────────────────

export async function getSessionRecap(sessionId: string) {
  const gs = await db.select().from(gameSession).where(eq(gameSession.id, sessionId)).get()
  if (!gs) return null

  const q = await db.select().from(quiz).where(eq(quiz.id, gs.quizId)).get()
  const players = await db.select().from(gamePlayer).where(eq(gamePlayer.sessionId, sessionId)).all()
  const nonMasterPlayers = players.filter(p => p.userId !== gs.masterId)

  const attempts = await db.select().from(questionAttempt)
    .where(eq(questionAttempt.sessionId, sessionId))
    .orderBy(asc(questionAttempt.resolvedAt))
    .all()

  const buzzes = await db.select().from(buzzLog)
    .where(eq(buzzLog.sessionId, sessionId))
    .all()

  const answered = await db.select().from(answeredQuestion)
    .where(eq(answeredQuestion.sessionId, sessionId))
    .all()

  const allQuestions = await db.select({
    id: question.id,
    questionText: question.questionText,
    answerText: question.answerText,
    rapidFire: question.rapidFire,
    rowIndex: question.rowIndex,
    categoryId: question.categoryId,
    categoryName: category.name,
    columnIndex: category.columnIndex,
  })
    .from(question)
    .innerJoin(category, eq(question.categoryId, category.id))
    .where(eq(question.quizId, gs.quizId))
    .all()
  const qById = new Map(allQuestions.map(q => [q.id, q]))

  // Score-Timeline: kumulative Punkte pro Spieler nach jedem Attempt
  const playerScoreByIdx = new Map<string, number>(nonMasterPlayers.map(p => [p.id, 0]))
  const timeline: Array<{ idx: number; questionId: string; pointValue: number; scores: Record<string, number> }> = []
  // Punktwerte je Frage aus quiz.pointValues
  const pointValues: number[] = q ? JSON.parse(q.pointValues) : []
  let idx = 0
  for (const a of attempts) {
    const cur = playerScoreByIdx.get(a.playerId) ?? 0
    playerScoreByIdx.set(a.playerId, cur + a.pointsAwarded)
    idx++
    const qInfo = qById.get(a.questionId)
    const pv = qInfo ? (pointValues[qInfo.rowIndex] ?? (qInfo.rowIndex + 1) * 100) : 0
    timeline.push({
      idx,
      questionId: a.questionId,
      pointValue: pv,
      scores: Object.fromEntries(playerScoreByIdx),
    })
  }

  // Highlights
  const playerById = new Map(players.map(p => [p.id, p]))
  const wrongAttempts = attempts.filter(a => a.isCorrect === false)

  const validReactions = buzzes.filter(b => typeof b.reactionMs === 'number' && b.reactionMs! > 0)
  const fastestBuzz = validReactions.length
    ? validReactions.reduce((a, b) => (a.reactionMs! < b.reactionMs!) ? a : b)
    : null
  const slowestBuzz = validReactions.length
    ? validReactions.reduce((a, b) => (a.reactionMs! > b.reactionMs!) ? a : b)
    : null

  // Trefferquote pro Spieler
  const perPlayerStats = nonMasterPlayers.map(p => {
    const myAttempts = attempts.filter(a => a.playerId === p.id)
    const myCorrect = myAttempts.filter(a => a.isCorrect).length
    const myWrong = myAttempts.filter(a => a.isCorrect === false).length
    const myBuzzes = buzzes.filter(b => b.playerId === p.id)
    const myReactions = myBuzzes.map(b => b.reactionMs).filter((x): x is number => typeof x === 'number' && x > 0)
    const avgReact = myReactions.length ? Math.round(myReactions.reduce((a, b) => a + b, 0) / myReactions.length) : null
    return {
      playerId: p.id,
      userId: p.userId,
      displayName: p.displayName,
      color: p.color,
      finalScore: p.score,
      correct: myCorrect,
      wrong: myWrong,
      accuracy: (myCorrect + myWrong) > 0 ? myCorrect / (myCorrect + myWrong) : 0,
      avgReactionMs: avgReact,
      buzzCount: myBuzzes.length,
    }
  })

  const mostCorrect = perPlayerStats.length
    ? perPlayerStats.reduce((a, b) => a.correct >= b.correct ? a : b)
    : null
  const mostWrong = perPlayerStats.length
    ? perPlayerStats.reduce((a, b) => a.wrong >= b.wrong ? a : b)
    : null
  const bestAccuracy = perPlayerStats.filter(p => (p.correct + p.wrong) >= 2).length
    ? perPlayerStats.filter(p => (p.correct + p.wrong) >= 2).reduce((a, b) => a.accuracy >= b.accuracy ? a : b)
    : null

  // Größter Punkt-Verlust an einer einzelnen Frage
  const biggestLoss = wrongAttempts.length
    ? wrongAttempts.reduce((a, b) => Math.abs(a.pointsAwarded) > Math.abs(b.pointsAwarded) ? a : b)
    : null

  // Längste Streak in dieser Session
  let bestStreakPlayer: { playerId: string; streak: number } | null = null
  for (const p of nonMasterPlayers) {
    const myA = attempts.filter(a => a.playerId === p.id)
    let cur = 0, maxS = 0
    for (const a of myA) {
      if (a.isCorrect) { cur++; if (cur > maxS) maxS = cur }
      else if (a.isCorrect === false) { cur = 0 }
    }
    if (!bestStreakPlayer || maxS > bestStreakPlayer.streak) {
      bestStreakPlayer = { playerId: p.id, streak: maxS }
    }
  }

  // Per-Frage-Details
  const perQuestion = answered.map(aq => {
    const qInfo = qById.get(aq.questionId)
    const qAttempts = attempts.filter(a => a.questionId === aq.questionId)
    const qBuzzes = buzzes.filter(b => b.questionId === aq.questionId)
    return {
      questionId: aq.questionId,
      categoryName: qInfo?.categoryName ?? '',
      questionText: qInfo?.questionText ?? '',
      answerText: qInfo?.answerText ?? '',
      pointValue: qInfo ? (pointValues[qInfo.rowIndex] ?? (qInfo.rowIndex + 1) * 100) : 0,
      resolution: aq.resolution,
      firstSolverPlayerId: aq.firstSolverPlayerId,
      firstSolverName: aq.firstSolverPlayerId ? playerById.get(aq.firstSolverPlayerId)?.displayName ?? null : null,
      firstSolverColor: aq.firstSolverPlayerId ? playerById.get(aq.firstSolverPlayerId)?.color ?? null : null,
      attempts: qAttempts.map(a => ({
        playerId: a.playerId,
        playerName: playerById.get(a.playerId)?.displayName ?? '?',
        playerColor: playerById.get(a.playerId)?.color ?? '#888',
        isCorrect: a.isCorrect,
        pointsAwarded: a.pointsAwarded,
        reactionMs: a.reactionMs,
        attemptOrder: a.attemptOrder,
      })),
      buzzCount: qBuzzes.length,
    }
  })

  // Pro Kategorie: Gelöst-Quote
  const catMap = new Map<string, { name: string; total: number; solved: number; skipped: number }>()
  for (const aq of answered) {
    const qInfo = qById.get(aq.questionId)
    if (!qInfo) continue
    const cur = catMap.get(qInfo.categoryName) ?? { name: qInfo.categoryName, total: 0, solved: 0, skipped: 0 }
    cur.total++
    if (aq.resolution === 'skipped') cur.skipped++
    else if (aq.resolution === 'solved' || aq.resolution === 'rapid_fire') cur.solved++
    catMap.set(qInfo.categoryName, cur)
  }
  const perCategory = Array.from(catMap.values())

  // Dauer
  const startTs = gs.startedAt ? (gs.startedAt instanceof Date ? gs.startedAt.getTime() : Number(gs.startedAt) * 1000) : null
  const endTs = gs.finishedAt ? (gs.finishedAt instanceof Date ? gs.finishedAt.getTime() : Number(gs.finishedAt) * 1000) : null
  const durationSec = startTs && endTs ? Math.round((endTs - startTs) / 1000) : null

  return {
    session: {
      id: gs.id,
      quizTitle: q?.title ?? 'Unbekanntes Quiz',
      status: gs.status,
      startedAt: startTs,
      finishedAt: endTs,
      durationSec,
      winnerPlayerId: gs.winnerPlayerId,
      totalQuestions: gs.totalQuestions,
      answeredCount: gs.answeredCount,
    },
    players: perPlayerStats,
    timeline,
    highlights: {
      fastestBuzz: fastestBuzz ? {
        playerId: fastestBuzz.playerId,
        playerName: playerById.get(fastestBuzz.playerId)?.displayName ?? '?',
        color: playerById.get(fastestBuzz.playerId)?.color ?? '#888',
        reactionMs: fastestBuzz.reactionMs,
        questionId: fastestBuzz.questionId,
        questionText: qById.get(fastestBuzz.questionId)?.questionText ?? '',
      } : null,
      slowestBuzz: slowestBuzz ? {
        playerId: slowestBuzz.playerId,
        playerName: playerById.get(slowestBuzz.playerId)?.displayName ?? '?',
        color: playerById.get(slowestBuzz.playerId)?.color ?? '#888',
        reactionMs: slowestBuzz.reactionMs,
        questionId: slowestBuzz.questionId,
        questionText: qById.get(slowestBuzz.questionId)?.questionText ?? '',
      } : null,
      mostCorrect,
      mostWrong,
      bestAccuracy,
      biggestLoss: biggestLoss ? {
        playerId: biggestLoss.playerId,
        playerName: playerById.get(biggestLoss.playerId)?.displayName ?? '?',
        color: playerById.get(biggestLoss.playerId)?.color ?? '#888',
        pointsLost: Math.abs(biggestLoss.pointsAwarded),
        questionId: biggestLoss.questionId,
        questionText: qById.get(biggestLoss.questionId)?.questionText ?? '',
      } : null,
      bestStreak: bestStreakPlayer && bestStreakPlayer.streak > 0 ? {
        playerId: bestStreakPlayer.playerId,
        playerName: playerById.get(bestStreakPlayer.playerId)?.displayName ?? '?',
        color: playerById.get(bestStreakPlayer.playerId)?.color ?? '#888',
        streak: bestStreakPlayer.streak,
      } : null,
    },
    perCategory,
    perQuestion,
  }
}

// ─── Hall of Fame ─────────────────────────────────────────────────────────────

export async function getHallOfFame() {
  // Top by wins
  const winRows = await db
    .select({
      userId: gamePlayer.userId,
      displayName: user.name,
      username: user.displayUsername,
      image: user.image,
      wins: count(),
    })
    .from(gameSession)
    .innerJoin(gamePlayer, eq(gamePlayer.id, gameSession.winnerPlayerId))
    .innerJoin(user, eq(user.id, gamePlayer.userId))
    .where(and(eq(gameSession.status, 'finished'), isNotNull(gameSession.winnerPlayerId)))
    .groupBy(gamePlayer.userId)
    .orderBy(desc(count()))
    .limit(10)
    .all()

  // Top by fastest buzz (Min reactionMs > 100ms um Glitches zu filtern)
  const fastestRows = await db
    .select({
      userId: gamePlayer.userId,
      displayName: user.name,
      username: user.displayUsername,
      reactionMs: sql<number>`MIN(${buzzLog.reactionMs})`,
    })
    .from(buzzLog)
    .innerJoin(gamePlayer, eq(gamePlayer.id, buzzLog.playerId))
    .innerJoin(user, eq(user.id, gamePlayer.userId))
    .where(sql`${buzzLog.reactionMs} > 100`)
    .groupBy(gamePlayer.userId)
    .orderBy(asc(sql`MIN(${buzzLog.reactionMs})`))
    .limit(10)
    .all()

  // Top by net points
  const pointsRows = await db
    .select({
      userId: gamePlayer.userId,
      displayName: user.name,
      username: user.displayUsername,
      netPoints: sql<number>`SUM(${questionAttempt.pointsAwarded})`,
    })
    .from(questionAttempt)
    .innerJoin(gamePlayer, eq(gamePlayer.id, questionAttempt.playerId))
    .innerJoin(user, eq(user.id, gamePlayer.userId))
    .groupBy(gamePlayer.userId)
    .orderBy(desc(sql`SUM(${questionAttempt.pointsAwarded})`))
    .limit(10)
    .all()

  // Top by correct answers
  const correctRows = await db
    .select({
      userId: gamePlayer.userId,
      displayName: user.name,
      username: user.displayUsername,
      correct: count(),
    })
    .from(questionAttempt)
    .innerJoin(gamePlayer, eq(gamePlayer.id, questionAttempt.playerId))
    .innerJoin(user, eq(user.id, gamePlayer.userId))
    .where(eq(questionAttempt.isCorrect, true))
    .groupBy(gamePlayer.userId)
    .orderBy(desc(count()))
    .limit(10)
    .all()

  // Most quizzes mastered (als Master)
  const mastersRows = await db
    .select({
      userId: gameSession.masterId,
      displayName: user.name,
      username: user.displayUsername,
      sessions: count(),
    })
    .from(gameSession)
    .innerJoin(user, eq(user.id, gameSession.masterId))
    .where(eq(gameSession.status, 'finished'))
    .groupBy(gameSession.masterId)
    .orderBy(desc(count()))
    .limit(10)
    .all()

  return {
    topByWins: winRows,
    topByFastestBuzz: fastestRows,
    topByNetPoints: pointsRows,
    topByCorrect: correctRows,
    topMasters: mastersRows,
  }
}

// ─── Session-Liste eines Users (für History) ──────────────────────────────────

export async function getUserSessionHistory(userId: string) {
  const myPlayers = await db.select().from(gamePlayer).where(eq(gamePlayer.userId, userId)).all()
  const sessionIds = [...new Set(myPlayers.map(p => p.sessionId))]
  if (sessionIds.length === 0) return []

  const sessions = await db
    .select({
      id: gameSession.id,
      quizTitle: quiz.title,
      status: gameSession.status,
      startedAt: gameSession.startedAt,
      finishedAt: gameSession.finishedAt,
      winnerPlayerId: gameSession.winnerPlayerId,
      masterId: gameSession.masterId,
    })
    .from(gameSession)
    .innerJoin(quiz, eq(quiz.id, gameSession.quizId))
    .where(inArray(gameSession.id, sessionIds))
    .orderBy(desc(gameSession.createdAt))
    .all()

  const myPlayerIds = new Set(myPlayers.map(p => p.id))
  return sessions.map(s => ({
    ...s,
    won: s.winnerPlayerId ? myPlayerIds.has(s.winnerPlayerId) : false,
    wasMaster: s.masterId === userId,
  }))
}

// ─── Quiz-Detail-Statistiken ──────────────────────────────────────────────────

export async function getQuizStats(quizId: string, userId?: string) {
  const { db } = await import('#/db/index')

  const quizRow = await db
    .select({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        columnCount: quiz.columnCount,
        rowCount: quiz.rowCount,
        pointValues: quiz.pointValues,
        wrongAnswerPenalty: quiz.wrongAnswerPenalty,
        isPublic: quiz.isPublic,
        createdAt: quiz.createdAt,
        updatedAt: quiz.updatedAt,
        creatorId: quiz.creatorId,
      },
      creatorName: user.name,
    })
    .from(quiz)
    .innerJoin(user, eq(quiz.creatorId, user.id))
    .where(eq(quiz.id, quizId))
    .get()

  if (!quizRow) return null

  const categories = await db.select().from(category).where(eq(category.quizId, quizId)).all()
  const questions = await db.select().from(question).where(eq(question.quizId, quizId)).all()
  const totalQuestions = questions.length
  const totalCategories = categories.length
  const rapidFireCount = questions.filter(q => q.rapidFire).length

  const mediaRows = questions.length
    ? await db.select().from(questionMedia).where(inArray(questionMedia.questionId, questions.map(q => q.id))).all()
    : []
  const legacyMediaCount = questions.filter(q => q.mediaUrl || q.youtubeUrl).length
  const mediaCount = mediaRows.length + legacyMediaCount

  const sessions = await db.select().from(gameSession).where(eq(gameSession.quizId, quizId)).all()
  const finishedSessions = sessions.filter(s => s.status === 'finished')
  const sessionIds = sessions.map(s => s.id)
  const finishedSessionIds = finishedSessions.map(s => s.id)

  const allPlayers = sessionIds.length
    ? await db.select().from(gamePlayer).where(inArray(gamePlayer.sessionId, sessionIds)).all()
    : []
  const finishedPlayers = allPlayers.filter(p => finishedSessionIds.includes(p.sessionId))
  const uniqueUserIds = [...new Set(finishedPlayers.map(p => p.userId).filter(Boolean))]
  const avgPlayersPerSession = finishedSessions.length
    ? Math.round((finishedPlayers.length / finishedSessions.length) * 10) / 10
    : 0

  const durations = finishedSessions
    .map(s => {
      const start = s.startedAt
        ? (s.startedAt instanceof Date ? s.startedAt.getTime() : Number(s.startedAt) * 1000)
        : null
      const end = s.finishedAt
        ? (s.finishedAt instanceof Date ? s.finishedAt.getTime() : Number(s.finishedAt) * 1000)
        : null
      return start && end ? Math.round((end - start) / 1000) : null
    })
    .filter((x): x is number => x !== null)
  const avgDurationSec = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null
  const shortestDurationSec = durations.length ? Math.min(...durations) : null
  const longestDurationSec = durations.length ? Math.max(...durations) : null

  const attempts = finishedSessionIds.length
    ? await db.select().from(questionAttempt).where(inArray(questionAttempt.sessionId, finishedSessionIds)).all()
    : []
  const buzzes = finishedSessionIds.length
    ? await db.select().from(buzzLog).where(inArray(buzzLog.sessionId, finishedSessionIds)).all()
    : []
  const answeredQs = finishedSessionIds.length
    ? await db.select().from(answeredQuestion).where(inArray(answeredQuestion.sessionId, finishedSessionIds)).all()
    : []

  const playerScores = finishedPlayers.map(p => p.score)
  const highScore = playerScores.length ? Math.max(...playerScores) : null
  const lowScore = playerScores.length ? Math.min(...playerScores) : null
  const avgScore = playerScores.length
    ? Math.round(playerScores.reduce((a, b) => a + b, 0) / playerScores.length)
    : null

  const winnerScores = finishedSessions
    .filter(s => s.winnerPlayerId)
    .map(s => finishedPlayers.find(p => p.id === s.winnerPlayerId)?.score ?? 0)
  const avgWinnerScore = winnerScores.length
    ? Math.round(winnerScores.reduce((a, b) => a + b, 0) / winnerScores.length)
    : null

  const totalPointsAwarded = attempts
    .filter(a => a.pointsAwarded > 0)
    .reduce((s, a) => s + a.pointsAwarded, 0)
  const totalPointsDeducted = attempts
    .filter(a => a.pointsAwarded < 0)
    .reduce((s, a) => s + Math.abs(a.pointsAwarded), 0)

  const totalQuestionSlots = totalQuestions * finishedSessions.length
  const solvedCount = answeredQs.filter(aq => aq.resolution === 'solved' || aq.resolution === 'rapid_fire').length
  const skippedCount = answeredQs.filter(aq => aq.resolution === 'skipped').length
  const unansweredCount = Math.max(0, totalQuestionSlots - answeredQs.length)

  const correctAttempts = attempts.filter(a => a.isCorrect).length
  const wrongAttempts = attempts.filter(a => a.isCorrect === false).length
  const avgCorrectPerSession = finishedSessions.length
    ? Math.round((correctAttempts / finishedSessions.length) * 10) / 10
    : 0
  const avgWrongPerSession = finishedSessions.length
    ? Math.round((wrongAttempts / finishedSessions.length) * 10) / 10
    : 0
  const avgSkippedPerSession = finishedSessions.length
    ? Math.round((skippedCount / finishedSessions.length) * 10) / 10
    : 0
  const avgUnansweredPerSession = finishedSessions.length
    ? Math.round((unansweredCount / finishedSessions.length) * 10) / 10
    : 0
  const overallSolveRate = totalQuestionSlots > 0
    ? Math.round((solvedCount / totalQuestionSlots) * 1000) / 10
    : 0

  const avgBuzzesPerQuestion = totalQuestions > 0 && finishedSessions.length > 0
    ? Math.round((buzzes.length / totalQuestionSlots) * 100) / 100
    : 0
  const validReactions = buzzes
    .map(b => b.reactionMs)
    .filter((x): x is number => typeof x === 'number' && x > 0)
  const avgReactionMs = validReactions.length
    ? Math.round(validReactions.reduce((a, b) => a + b, 0) / validReactions.length)
    : null
  const fastestBuzzMs = validReactions.length ? Math.min(...validReactions) : null

  // Per category
  const catStats = categories.map(cat => {
    const catQuestions = questions.filter(q => q.categoryId === cat.id)
    const catQuestionIds = catQuestions.map(q => q.id)
    const catAnswered = answeredQs.filter(aq => catQuestionIds.includes(aq.questionId))
    const slots = catQuestions.length * finishedSessions.length
    const solved = catAnswered.filter(aq => aq.resolution === 'solved' || aq.resolution === 'rapid_fire').length
    const skipped = catAnswered.filter(aq => aq.resolution === 'skipped').length
    return {
      name: cat.name,
      totalQuestions: catQuestions.length,
      solveRate: slots > 0 ? Math.round((solved / slots) * 1000) / 10 : 0,
      skipRate: slots > 0 ? Math.round((skipped / slots) * 1000) / 10 : 0,
    }
  })

  // Extremes
  const wrongByQuestion = new Map<string, number>()
  const skipByQuestion = new Map<string, number>()
  for (const a of attempts) {
    if (a.isCorrect === false) {
      wrongByQuestion.set(a.questionId, (wrongByQuestion.get(a.questionId) ?? 0) + 1)
    }
  }
  for (const aq of answeredQs) {
    if (aq.resolution === 'skipped') {
      skipByQuestion.set(aq.questionId, (skipByQuestion.get(aq.questionId) ?? 0) + 1)
    }
  }

  let hardestQuestion: { id: string; text: string; wrongCount: number } | null = null
  let maxWrong = -1
  for (const [qid, count] of wrongByQuestion) {
    if (count > maxWrong) {
      maxWrong = count
      hardestQuestion = { id: qid, text: questions.find(q => q.id === qid)?.questionText ?? '', wrongCount: count }
    }
  }

  let mostSkippedQuestion: { id: string; text: string; skipCount: number } | null = null
  let maxSkip = -1
  for (const [qid, count] of skipByQuestion) {
    if (count > maxSkip) {
      maxSkip = count
      mostSkippedQuestion = { id: qid, text: questions.find(q => q.id === qid)?.questionText ?? '', skipCount: count }
    }
  }

  // Player records
  const playerBestScore = new Map<string, { name: string; score: number; color: string }>()
  for (const p of finishedPlayers) {
    const cur = playerBestScore.get(p.id)
    if (!cur || p.score > cur.score) {
      playerBestScore.set(p.id, { name: p.displayName, score: p.score, color: p.color })
    }
  }
  let bestPlayerEver: { name: string; score: number; color: string } | null = null
  for (const [, v] of playerBestScore) {
    if (!bestPlayerEver || v.score > bestPlayerEver.score) bestPlayerEver = v
  }

  const userSessionCounts = new Map<string, { name: string; count: number }>()
  for (const p of finishedPlayers) {
    if (p.userId) {
      const cur = userSessionCounts.get(p.userId)
      if (cur) cur.count++
      else userSessionCounts.set(p.userId, { name: p.displayName, count: 1 })
    }
  }
  let mostPlayedPlayer: { name: string; count: number } | null = null
  for (const [, v] of userSessionCounts) {
    if (!mostPlayedPlayer || v.count > mostPlayedPlayer.count) mostPlayedPlayer = v
  }

  // User-specific stats
  let userStats = null
  if (userId) {
    const myPlayers = finishedPlayers.filter(p => p.userId === userId)
    const myPlayerIds = myPlayers.map(p => p.id)
    const myAttempts = attempts.filter(a => myPlayerIds.includes(a.playerId))
    const myBuzzes = buzzes.filter(b => myPlayerIds.includes(b.playerId))
    const myScores = myPlayers.map(p => p.score)
    const myCorrect = myAttempts.filter(a => a.isCorrect).length
    const myWrong = myAttempts.filter(a => a.isCorrect === false).length
    const myReactions = myBuzzes
      .map(b => b.reactionMs)
      .filter((x): x is number => typeof x === 'number' && x > 0)

    const myWins = finishedSessions.filter(
      s => s.winnerPlayerId && myPlayerIds.includes(s.winnerPlayerId)
    ).length

    let bestStreak = 0
    for (const p of myPlayers) {
      const pAttempts = myAttempts
        .filter(a => a.playerId === p.id)
        .sort((a, b) => (a.resolvedAt?.getTime() ?? 0) - (b.resolvedAt?.getTime() ?? 0))
      let cur = 0
      let maxS = 0
      for (const a of pAttempts) {
        if (a.isCorrect) {
          cur++
          if (cur > maxS) maxS = cur
        } else if (a.isCorrect === false) {
          cur = 0
        }
      }
      if (maxS > bestStreak) bestStreak = maxS
    }

    userStats = {
      sessionsPlayed: myPlayers.length,
      highScore: myScores.length ? Math.max(...myScores) : null,
      lowScore: myScores.length ? Math.min(...myScores) : null,
      avgScore: myScores.length
        ? Math.round(myScores.reduce((a, b) => a + b, 0) / myScores.length)
        : null,
      totalCorrect: myCorrect,
      totalWrong: myWrong,
      accuracy: (myCorrect + myWrong) > 0
        ? Math.round((myCorrect / (myCorrect + myWrong)) * 1000) / 10
        : 0,
      avgReactionMs: myReactions.length
        ? Math.round(myReactions.reduce((a, b) => a + b, 0) / myReactions.length)
        : null,
      fastestBuzzMs: myReactions.length ? Math.min(...myReactions) : null,
      wins: myWins,
      bestStreak,
    }
  }

  return {
    quiz: {
      title: quizRow.quiz.title,
      description: quizRow.quiz.description,
      creatorName: quizRow.creatorName,
      createdAt: quizRow.quiz.createdAt,
      updatedAt: quizRow.quiz.updatedAt,
      isPublic: quizRow.quiz.isPublic,
      grid: `${quizRow.quiz.columnCount} × ${quizRow.quiz.rowCount}`,
      pointValues: JSON.parse(quizRow.quiz.pointValues) as number[],
      penalty: quizRow.quiz.wrongAnswerPenalty,
      totalQuestions,
      totalCategories,
      rapidFireCount,
      mediaCount,
    },
    global: {
      totalFinishedSessions: finishedSessions.length,
      totalUniquePlayers: uniqueUserIds.length,
      avgPlayersPerSession,
      avgDurationSec,
      shortestDurationSec,
      longestDurationSec,
      highScore,
      lowScore,
      avgWinnerScore,
      avgScore,
      totalPointsAwarded,
      totalPointsDeducted,
      avgCorrectPerSession,
      avgWrongPerSession,
      avgSkippedPerSession,
      avgUnansweredPerSession,
      overallSolveRate,
      avgBuzzesPerQuestion,
      avgReactionMs,
      fastestBuzzMs,
      bestPlayerEver,
      mostPlayedPlayer,
      hardestQuestion,
      mostSkippedQuestion,
      perCategory: catStats,
    },
    userStats,
  }
}
