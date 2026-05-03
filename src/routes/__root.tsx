import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  Link,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Jeopardy 2.0' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
})

function RootComponent() {
  const { data: session, isPending } = authClient.useSession()

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      <nav className="bg-neutral-900 border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold text-yellow-400 tracking-wide">
          🎯 Jeopardy 2.0
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {!isPending && session?.user ? (
            <>
              <Link to="/quizzes" className="text-neutral-300 hover:text-white transition-colors">
                Meine Quizze
              </Link>
              <Link to="/sessions/new" className="text-neutral-300 hover:text-white transition-colors">
                Spiel starten
              </Link>
              {(session.user as {isAdmin?: boolean})?.isAdmin && (
                <Link to="/admin/invites" className="text-yellow-500 hover:text-yellow-400 transition-colors text-xs">
                  Admin
                </Link>
              )}
              <Link to="/settings" className="text-neutral-300 hover:text-white transition-colors">
                {session.user.name}
              </Link>
              <button
                onClick={() => void authClient.signOut()}
                className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-200 transition-colors"
              >
                Abmelden
              </button>
            </>
          ) : !isPending ? (
            <Link
              to="/auth/login"
              className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-black font-medium rounded transition-colors"
            >
              Anmelden
            </Link>
          ) : null}
        </div>
      </nav>
      <main className="flex-1">
        <Outlet />
      </main>
      <TanStackDevtools
        config={{ position: 'bottom-right' }}
        plugins={[
          { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
          TanStackQueryDevtools,
        ]}
      />
      <Scripts />
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
