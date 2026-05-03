import { db } from '#/db/index'
import { gameSession, gamePlayer, question, category, quiz, answeredQuestion, buzzLog, questionAttempt } from '#/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

export type GamePhase =
  | 'LOBBY'
  | 'SELECTING'
  | 'QUESTION_OPEN'
  | 'BUZZING'
  | 'JUDGING'
  | 'ANSWER_REVEALED'
  | 'GAME_OVER'

export interface BoardQuestion {
  id: string
  pointValue: number
  answered: boolean
}

export interface BoardCategory {
  id: string
  name: string
  questions: BoardQuestion[]
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
  allowRebuzz: boolean
}

export interface PlayerState {
  id: string
  displayName: string
  score: number
  isConnected: boolean
  userId: string | null
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
}

export const gameStateMap = new Map<string, GameState>()

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

  const board: BoardCategory[] = categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    questions: questions
      .filter(q => q.categoryId === cat.id)
      .sort((a, b) => a.rowIndex - b.rowIndex)
      .map(q => ({
        id: q.id,
        pointValue: pointValues[q.rowIndex] ?? (q.rowIndex + 1) * 100,
        answered: answeredIds.includes(q.id),
      })),
  }))

  const state: GameState = {
    sessionId,
    phase: gs.currentState as GamePhase,
    masterId: gs.masterId,
    players: players.map(p => ({
      id: p.id,
      displayName: p.displayName,
      score: p.score,
      isConnected: p.isConnected,
      userId: p.userId,
    })),
    activePlayerId: gs.activePlayerId,
    activeQuestion: null,
    buzzedPlayerId: null,
    answeredQuestionIds: answeredIds,
    buzzedPlayerIds: [],
    board,
    winnerId: null,
    pointValues,
    wrongAnswerPenalty: q.wrongAnswerPenalty,
  }

  if (gs.activeQuestionId) {
    const aq = questions.find(q => q.id === gs.activeQuestionId)
    if (aq) {
      const cat = categories.find(c => c.id === aq.categoryId)
      state.activeQuestion = {
        id: aq.id,
        categoryName: cat?.name ?? '',
        pointValue: pointValues[aq.rowIndex] ?? (aq.rowIndex + 1) * 100,
        questionText: aq.questionText,
        answerText: aq.answerText,
        mediaUrl: aq.mediaUrl,
        mediaType: aq.mediaType,
        youtubeUrl: aq.youtubeUrl,
        allowRebuzz: aq.allowRebuzz,
      }
    }
    const buzzes = await db.select().from(buzzLog)
      .where(and(eq(buzzLog.sessionId, sessionId), eq(buzzLog.questionId, gs.activeQuestionId)))
      .all()
    state.buzzedPlayerIds = buzzes.map(b => b.playerId)
  }

  gameStateMap.set(sessionId, state)
  return state
}

export async function applyEvent(
  sessionId: string,
  event: { type: string; payload: Record<string, unknown> },
): Promise<GameState | null> {
  let state = gameStateMap.get(sessionId) ?? await loadGameState(sessionId)
  if (!state) return null

  const { type, payload } = event

  switch (type) {
    case 'START_GAME': {
      if (state.phase !== 'LOBBY') break
      const nonMasterPlayers = state.players.filter(p => p.userId !== state!.masterId)
      if (nonMasterPlayers.length === 0) break
      const randomIdx = Math.floor(Math.random() * nonMasterPlayers.length)
      const firstPlayer = nonMasterPlayers[randomIdx]
      state = { ...state, phase: 'SELECTING', activePlayerId: firstPlayer.id }
      await db.update(gameSession).set({ currentState: 'SELECTING', activePlayerId: firstPlayer.id, status: 'active' }).where(eq(gameSession.id, sessionId))
      break
    }

    case 'SELECT_QUESTION': {
      if (state.phase !== 'SELECTING') break
      const qId = payload.questionId as string
      const allQuestions = state.board.flatMap(c => c.questions)
      const boardQ = allQuestions.find(q => q.id === qId)
      if (!boardQ || boardQ.answered) break

      const aq = await db.select().from(question).where(eq(question.id, qId)).get()
      if (!aq) break
      const cat = state.board.find(c => c.questions.some(q => q.id === qId))
      state = {
        ...state,
        phase: 'QUESTION_OPEN',
        activeQuestion: {
          id: aq.id,
          categoryName: cat?.name ?? '',
          pointValue: boardQ.pointValue,
          questionText: aq.questionText,
          answerText: aq.answerText,
          mediaUrl: aq.mediaUrl,
          mediaType: aq.mediaType,
          youtubeUrl: aq.youtubeUrl,
          allowRebuzz: aq.allowRebuzz,
        },
        buzzedPlayerId: null,
        buzzedPlayerIds: [],
      }
      await db.update(gameSession).set({ currentState: 'QUESTION_OPEN', activeQuestionId: qId }).where(eq(gameSession.id, sessionId))
      break
    }

    case 'BUZZ': {
      if (state.phase !== 'QUESTION_OPEN') break
      if (!state.activeQuestion) break
      const playerId = payload.playerId as string
      const player = state.players.find(p => p.id === playerId)
      if (!player) break
      if (player.userId === state.masterId) break
      const alreadyBuzzed = state.buzzedPlayerIds.includes(playerId)
      if (alreadyBuzzed && !state.activeQuestion.allowRebuzz) break

      await db.insert(buzzLog).values({
        sessionId,
        questionId: state.activeQuestion.id,
        playerId,
      }).onConflictDoNothing()

      state = {
        ...state,
        phase: 'JUDGING',
        buzzedPlayerId: playerId,
        buzzedPlayerIds: [...new Set([...state.buzzedPlayerIds, playerId])],
      }
      await db.update(gameSession).set({ currentState: 'JUDGING' }).where(eq(gameSession.id, sessionId))
      break
    }

    case 'JUDGE': {
      if (state.phase !== 'JUDGING') break
      if (!state.activeQuestion || !state.buzzedPlayerId) break
      const correct = payload.correct as boolean
      const buzzedPlayerId = state.buzzedPlayerId
      const activeQuestion = state.activeQuestion
      const buzzedPlayer = state.players.find(p => p.id === buzzedPlayerId)
      if (!buzzedPlayer) break

      const pointValue = activeQuestion.pointValue
      const delta = correct ? pointValue : -Math.round(pointValue * state.wrongAnswerPenalty)
      const newScore = buzzedPlayer.score + delta

      await db.update(gamePlayer).set({ score: newScore }).where(eq(gamePlayer.id, buzzedPlayerId))
      await db.insert(questionAttempt).values({
        id: nanoid(10),
        sessionId,
        questionId: activeQuestion.id,
        playerId: buzzedPlayerId,
        isCorrect: correct,
        pointsAwarded: delta,
        buzzedAt: new Date(),
        resolvedAt: new Date(),
      })

      state = {
        ...state,
        players: state.players.map(p =>
          p.id === buzzedPlayerId ? { ...p, score: newScore } : p
        ),
      }

      if (correct) {
        await db.insert(answeredQuestion).values({ sessionId, questionId: activeQuestion.id }).onConflictDoNothing()
        const newAnswered = [...state.answeredQuestionIds, activeQuestion.id]
        const newBoard = state.board.map(c => ({
          ...c,
          questions: c.questions.map(q => q.id === activeQuestion.id ? { ...q, answered: true } : q),
        }))
        const allAnswered = newBoard.every(c => c.questions.every(q => q.answered))
        const newPhase: GamePhase = allAnswered ? 'GAME_OVER' : 'ANSWER_REVEALED'
        const winnerId = allAnswered
          ? state.players.reduce((a, b) => a.score > b.score ? a : b, state.players[0]).id
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
        }).where(eq(gameSession.id, sessionId))
        if (allAnswered) {
          await db.update(gameSession).set({ finishedAt: new Date() }).where(eq(gameSession.id, sessionId))
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
      break
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'ANSWER_REVEALED') break
      state = { ...state, phase: 'SELECTING', activeQuestion: null, buzzedPlayerId: null, buzzedPlayerIds: [] }
      await db.update(gameSession).set({ currentState: 'SELECTING', activeQuestionId: null }).where(eq(gameSession.id, sessionId))
      break
    }

    case 'PLAYER_CONNECTED': {
      const playerId = payload.playerId as string
      state = { ...state, players: state.players.map(p => p.id === playerId ? { ...p, isConnected: true } : p) }
      await db.update(gamePlayer).set({ isConnected: true }).where(eq(gamePlayer.id, playerId))
      break
    }

    case 'PLAYER_DISCONNECTED': {
      const playerId = payload.playerId as string
      state = { ...state, players: state.players.map(p => p.id === playerId ? { ...p, isConnected: false } : p) }
      await db.update(gamePlayer).set({ isConnected: false }).where(eq(gamePlayer.id, playerId))
      break
    }
  }

  gameStateMap.set(sessionId, state)
  return state
}
