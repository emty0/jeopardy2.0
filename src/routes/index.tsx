import { createFileRoute, Link } from '@tanstack/react-router'
import { authClient } from '#/lib/auth-client'
import { motion } from 'framer-motion'
import { Library, Play, Tv, Smartphone, Sparkles, Hash } from 'lucide-react'
import { Button, Wordmark, Pill } from '#/components/ui'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data: session } = authClient.useSession()

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-4 py-16 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center gap-6 max-w-2xl"
      >
        <Pill tone="violet" leading={<Sparkles className="w-3 h-3" />}>
          Realtime · Multiplayer · Selbstgemacht
        </Pill>
        <Wordmark size="xl" />
        <p className="text-ink-300 text-lg sm:text-xl leading-relaxed max-w-xl">
          Erstelle dein eigenes Quiz-Board und spiele live mit Freunden — TV als Bühne, Handys
          als Buzzer.
        </p>

        <div className="flex flex-wrap gap-3 justify-center mt-2">
          {session?.user ? (
            <>
              <Link to="/quizzes">
                <Button variant="primary" size="lg" leading={<Library className="w-5 h-5" />}>
                  Meine Quizze
                </Button>
              </Link>
              <Link to="/sessions/new">
                <Button variant="accent" size="lg" leading={<Play className="w-5 h-5" />}>
                  Spiel starten
                </Button>
              </Link>
              <Link to="/join">
                <Button variant="subtle" size="lg" leading={<Hash className="w-5 h-5" />}>
                  Beitreten
                </Button>
              </Link>
            </>
          ) : (
            <Link to="/auth/login">
              <Button variant="primary" size="lg">
                Jetzt anmelden
              </Button>
            </Link>
          )}
        </div>
      </motion.div>

      <div className="grid sm:grid-cols-3 gap-4 mt-16 w-full max-w-4xl">
        <FeatureCard
          icon={<Tv className="w-5 h-5" />}
          title="TV-Bühne"
          text="Großer Bildschirm zeigt das Board, Fragen, Videos und animierte Antworten."
          delay={0.1}
        />
        <FeatureCard
          icon={<Smartphone className="w-5 h-5" />}
          title="Handy-Buzzer"
          text="Spieler joinen per QR-Code und buzzern in Echtzeit über ihr Smartphone."
          delay={0.2}
        />
        <FeatureCard
          icon={<Sparkles className="w-5 h-5" />}
          title="Eigene Quizze"
          text="Erstelle Boards mit beliebigen Kategorien, Punktwerten und Medien."
          delay={0.3}
        />
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  text,
  delay,
}: {
  icon: React.ReactNode
  title: string
  text: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="rounded-2xl border border-bg-700/60 bg-bg-800/40 backdrop-blur-sm px-5 py-5 text-left"
    >
      <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400 mb-3">
        {icon}
      </div>
      <p className="font-board uppercase tracking-wider text-lg text-ink-50">{title}</p>
      <p className="text-ink-300 text-sm mt-1 leading-relaxed">{text}</p>
    </motion.div>
  )
}
