import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { username } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db/index'
import * as schema from '#/db/schema'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema,
  }),
  trustedOrigins: [
    'http://localhost:3000',
    'http://192.168.178.21:3000',
  ],
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies(), username()],
})
