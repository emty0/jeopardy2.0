import Database from 'better-sqlite3'

const db = new Database('dev.db')

const tries = [
  { name: 'game_player.color', sql: "ALTER TABLE game_player ADD COLUMN color TEXT NOT NULL DEFAULT '#7C3AED'" },
  { name: 'question.autoplay_media', sql: "ALTER TABLE question ADD COLUMN autoplay_media INTEGER NOT NULL DEFAULT 0" },
  { name: 'question.show_media_on_player', sql: "ALTER TABLE question ADD COLUMN show_media_on_player INTEGER NOT NULL DEFAULT 0" },
  { name: 'question.media_placeholder', sql: "ALTER TABLE question ADD COLUMN media_placeholder INTEGER NOT NULL DEFAULT 0" },
  { name: 'question_media.role', sql: "ALTER TABLE question_media ADD COLUMN role TEXT NOT NULL DEFAULT 'question'" },
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
