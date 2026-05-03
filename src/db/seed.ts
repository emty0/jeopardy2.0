import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import * as schema from './schema.ts'

const sqlite = new Database(process.env.DATABASE_URL!)
const db = drizzle(sqlite, { schema })

const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  emailAndPassword: { enabled: true },
})

async function seed() {
  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, 'admin@jeopardy.local'))
    .get()

  if (!existing) {
    await auth.api.signUpEmail({
      body: {
        email: 'admin@jeopardy.local',
        password: 'e4i#oPxjvWyJ!eZq8QYQ',
        name: 'Admin',
      },
    })
    await db
      .update(schema.user)
      .set({ isAdmin: true, username: 'Admin', displayUsername: 'Admin' })
      .where(eq(schema.user.email, 'admin@jeopardy.local'))
    console.log('✓ Admin-User angelegt: admin@jeopardy.local')
  } else {
    console.log('✓ Admin-User existiert bereits.')
  }

  sqlite.close()
}

seed().catch(console.error)
