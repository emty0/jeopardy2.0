import { sqliteTable, integer, text, real, primaryKey } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const id = () => text('id').primaryKey().$defaultFn(() => nanoid(10))
const now = () => integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
const nowUpd = () => integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)

// ─── Better Auth Core Tables ─────────────────────────────────────────────────

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  buzzerSoundUrl: text('buzzer_sound_url'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
})

// ─── Einladungen ─────────────────────────────────────────────────────────────

export const invite = sqliteTable('invite', {
  id: text('id').primaryKey().$defaultFn(() => nanoid(8)),
  email: text('email').notNull(),
  invitedById: text('invited_by_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: now(),
})

// ─── Quiz & Fragen ───────────────────────────────────────────────────────────

export const quiz = sqliteTable('quiz', {
  id: id(),
  creatorId: text('creator_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  columnCount: integer('column_count').notNull().default(5),
  rowCount: integer('row_count').notNull().default(5),
  pointValues: text('point_values').notNull().default('[100,200,300,400,500]'),
  wrongAnswerPenalty: real('wrong_answer_penalty').notNull().default(1.0),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  createdAt: now(),
  updatedAt: nowUpd(),
})

export const category = sqliteTable('category', {
  id: id(),
  quizId: text('quiz_id').notNull().references(() => quiz.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  columnIndex: integer('column_index').notNull(),
  allowRebuzz: integer('allow_rebuzz', { mode: 'boolean' }).notNull().default(true),
})

export const question = sqliteTable('question', {
  id: id(),
  categoryId: text('category_id').notNull().references(() => category.id, { onDelete: 'cascade' }),
  quizId: text('quiz_id').notNull().references(() => quiz.id, { onDelete: 'cascade' }),
  rowIndex: integer('row_index').notNull(),
  questionText: text('question_text').notNull(),
  answerText: text('answer_text').notNull(),
  mediaUrl: text('media_url'),
  mediaType: text('media_type'), // 'image' | 'audio' | 'video'
  youtubeUrl: text('youtube_url'),
  allowRebuzz: integer('allow_rebuzz', { mode: 'boolean' }).notNull().default(true),
})

// ─── Game Sessions ────────────────────────────────────────────────────────────

export const gameSession = sqliteTable('game_session', {
  id: id(),
  quizId: text('quiz_id').notNull().references(() => quiz.id),
  masterId: text('master_id').notNull().references(() => user.id),
  joinCode: text('join_code').notNull().unique(),
  status: text('status').notNull().default('lobby'), // 'lobby' | 'active' | 'finished'
  currentState: text('current_state').notNull().default('LOBBY'),
  activePlayerId: text('active_player_id'),
  activeQuestionId: text('active_question_id'),
  createdAt: now(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
})

export const gamePlayer = sqliteTable('game_player', {
  id: id(),
  sessionId: text('session_id').notNull().references(() => gameSession.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => user.id),
  displayName: text('display_name').notNull(),
  score: integer('score').notNull().default(0),
  isConnected: integer('is_connected', { mode: 'boolean' }).notNull().default(true),
  joinedAt: now(),
})

export const questionAttempt = sqliteTable('question_attempt', {
  id: id(),
  sessionId: text('session_id').notNull().references(() => gameSession.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => question.id),
  playerId: text('player_id').notNull().references(() => gamePlayer.id),
  isCorrect: integer('is_correct', { mode: 'boolean' }),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  buzzedAt: integer('buzzed_at', { mode: 'timestamp' }),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
})

export const answeredQuestion = sqliteTable('answered_question', {
  sessionId: text('session_id').notNull().references(() => gameSession.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => question.id),
}, (t) => [primaryKey({ columns: [t.sessionId, t.questionId] })])

export const buzzLog = sqliteTable('buzz_log', {
  sessionId: text('session_id').notNull().references(() => gameSession.id, { onDelete: 'cascade' }),
  questionId: text('question_id').notNull().references(() => question.id),
  playerId: text('player_id').notNull().references(() => gamePlayer.id),
  buzzedAt: integer('buzzed_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => [primaryKey({ columns: [t.sessionId, t.questionId, t.playerId] })])
