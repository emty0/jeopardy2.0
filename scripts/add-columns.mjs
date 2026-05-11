import Database from 'better-sqlite3'

const db = new Database('dev.db')

const tries = [
  { name: 'game_player.color', sql: "ALTER TABLE game_player ADD COLUMN color TEXT NOT NULL DEFAULT '#7C3AED'" },
  { name: 'question.autoplay_media', sql: "ALTER TABLE question ADD COLUMN autoplay_media INTEGER NOT NULL DEFAULT 0" },
  { name: 'question.show_media_on_player', sql: "ALTER TABLE question ADD COLUMN show_media_on_player INTEGER NOT NULL DEFAULT 0" },
  { name: 'question.media_placeholder', sql: "ALTER TABLE question ADD COLUMN media_placeholder INTEGER NOT NULL DEFAULT 0" },
  { name: 'question_media.role', sql: "ALTER TABLE question_media ADD COLUMN role TEXT NOT NULL DEFAULT 'question'" },

  // ─── Stats Tracking ────────────────────────────────────────────────────────
  { name: 'game_session.winner_player_id', sql: "ALTER TABLE game_session ADD COLUMN winner_player_id TEXT" },
  { name: 'game_session.started_at', sql: "ALTER TABLE game_session ADD COLUMN started_at INTEGER" },
  { name: 'game_session.total_questions', sql: "ALTER TABLE game_session ADD COLUMN total_questions INTEGER" },
  { name: 'game_session.answered_count', sql: "ALTER TABLE game_session ADD COLUMN answered_count INTEGER NOT NULL DEFAULT 0" },

  { name: 'question_attempt.attempt_order', sql: "ALTER TABLE question_attempt ADD COLUMN attempt_order INTEGER NOT NULL DEFAULT 0" },
  { name: 'question_attempt.no_penalty_applied', sql: "ALTER TABLE question_attempt ADD COLUMN no_penalty_applied INTEGER NOT NULL DEFAULT 0" },
  { name: 'question_attempt.was_rapid_fire', sql: "ALTER TABLE question_attempt ADD COLUMN was_rapid_fire INTEGER NOT NULL DEFAULT 0" },
  { name: 'question_attempt.revealed_media_index_at_buzz', sql: "ALTER TABLE question_attempt ADD COLUMN revealed_media_index_at_buzz INTEGER NOT NULL DEFAULT -1" },
  { name: 'question_attempt.reaction_ms', sql: "ALTER TABLE question_attempt ADD COLUMN reaction_ms INTEGER" },

  { name: 'buzz_log.revealed_at', sql: "ALTER TABLE buzz_log ADD COLUMN revealed_at INTEGER" },
  { name: 'buzz_log.reaction_ms', sql: "ALTER TABLE buzz_log ADD COLUMN reaction_ms INTEGER" },

  { name: 'answered_question.resolution', sql: "ALTER TABLE answered_question ADD COLUMN resolution TEXT NOT NULL DEFAULT 'solved'" },
  { name: 'answered_question.solved_at', sql: "ALTER TABLE answered_question ADD COLUMN solved_at INTEGER" },
  { name: 'answered_question.first_solver_player_id', sql: "ALTER TABLE answered_question ADD COLUMN first_solver_player_id TEXT" },

  { name: 'game_event (table)', sql: `CREATE TABLE IF NOT EXISTS game_event (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES game_session(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    type TEXT NOT NULL,
    actor_player_id TEXT,
    actor_user_id TEXT,
    question_id TEXT,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )` },
  { name: 'question_reveal (table)', sql: `CREATE TABLE IF NOT EXISTS question_reveal (
    session_id TEXT NOT NULL REFERENCES game_session(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL REFERENCES question(id),
    revealed_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, question_id)
  )` },

  { name: 'idx_game_event_session_seq', sql: 'CREATE INDEX IF NOT EXISTS idx_game_event_session_seq ON game_event(session_id, seq)' },
  { name: 'idx_game_event_type', sql: 'CREATE INDEX IF NOT EXISTS idx_game_event_type ON game_event(type)' },
  { name: 'idx_question_attempt_player', sql: 'CREATE INDEX IF NOT EXISTS idx_question_attempt_player ON question_attempt(player_id)' },
  { name: 'idx_question_attempt_session', sql: 'CREATE INDEX IF NOT EXISTS idx_question_attempt_session ON question_attempt(session_id)' },
  { name: 'idx_question_attempt_question', sql: 'CREATE INDEX IF NOT EXISTS idx_question_attempt_question ON question_attempt(question_id)' },
  { name: 'idx_buzz_log_player', sql: 'CREATE INDEX IF NOT EXISTS idx_buzz_log_player ON buzz_log(player_id)' },
  { name: 'idx_game_player_user', sql: 'CREATE INDEX IF NOT EXISTS idx_game_player_user ON game_player(user_id)' },
  { name: 'idx_game_session_status', sql: 'CREATE INDEX IF NOT EXISTS idx_game_session_status ON game_session(status)' },
]

for (const t of tries) {
  try {
    db.exec(t.sql)
    console.log('ok:', t.name)
  } catch (e) {
    console.log('skip:', t.name, '-', e.message)
  }
}

db.close()
console.log('done')
