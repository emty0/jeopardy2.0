import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { LogOut } from 'lucide-react'

export function SessionClosedOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-950/95 backdrop-blur-md px-6"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
        className="max-w-sm w-full flex flex-col items-center text-center gap-5"
      >
        <div className="w-16 h-16 rounded-full bg-bad/15 border-2 border-bad/30 flex items-center justify-center">
          <LogOut className="w-7 h-7 text-bad" />
        </div>
        <div>
          <p className="font-board uppercase text-2xl text-ink-50 tracking-wider">
            Quiz beendet
          </p>
          <p className="text-ink-300 text-sm mt-2">
            Der Master hat das Quiz beendet.
          </p>
        </div>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-violet-500 hover:bg-violet-400 text-bg-950 font-bold shadow-[var(--shadow-glow-violet)] transition-colors"
        >
          Zur Startseite
        </Link>
      </motion.div>
    </motion.div>
  )
}
