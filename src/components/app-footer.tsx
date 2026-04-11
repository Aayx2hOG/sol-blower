import Link from 'next/link'
import React from 'react'

export function AppFooter() {
  return (
    <footer className="border-t border-white/10 bg-zinc-950/90 px-4 py-6 text-xs text-zinc-400 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>SolZk is a Solana-native anonymous reporting starter for production workflows.</p>
        <div className="flex items-center gap-4">
          <Link className="transition-colors hover:text-white" href="/report">
            Reporter
          </Link>
          <Link className="transition-colors hover:text-white" href="/">
            Home
          </Link>
        </div>
      </div>
    </footer>
  )
}
