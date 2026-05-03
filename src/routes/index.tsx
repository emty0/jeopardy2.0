import { createFileRoute, Link } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data: session } = authClient.useSession()

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 text-center">
      <h1 className="text-6xl font-black text-yellow-400 mb-4 tracking-tight">Jeopardy 2.0</h1>
      <p className="text-neutral-400 text-lg max-w-md mb-10">
        Erstelle dein eigenes Quiz-Board und spiele mit Freunden — live auf dem TV.
      </p>
      {session?.user ? (
        <div className="flex gap-4 flex-wrap justify-center">
          <Link to="/quizzes" className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg transition-colors">
            Meine Quizze
          </Link>
          <Link to="/sessions/new" className="px-6 py-3 bg-neutral-700 hover:bg-neutral-600 text-white font-bold rounded-xl text-lg transition-colors">
            Spiel starten
          </Link>
        </div>
      ) : (
        <Link to="/auth/login" className="px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded-xl text-lg transition-colors">
          Jetzt anmelden
        </Link>
      )}
    </div>
  )
}
