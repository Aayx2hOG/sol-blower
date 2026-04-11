'use client'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Menu, X, ShieldCheck, ArrowRight } from 'lucide-react'
import { ThemeSelect } from '@/components/theme-select'
import { WalletButton } from '@/components/solana/solana-provider'

export function AppHeader({ links = [] }: { links: { label: string; path: string }[] }) {
  const pathname = usePathname()
  const [showMenu, setShowMenu] = useState(false)

  function isActive(path: string) {
    return path === '/' ? pathname === '/' : pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/70 px-4 py-3 text-zinc-200 backdrop-blur-2xl">
      <div className="mx-auto flex items-center justify-between gap-4 lg:max-w-7xl">
        <div className="flex items-center gap-6">
          <Link className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white" href="/">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-zinc-100">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="font-mono text-base">SolZk</span>
          </Link>
          <div className="hidden md:flex items-center">
            <ul className="flex items-center gap-1">
              {links.map(({ label, path }) => (
                <li key={path}>
                  <Link className={`rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/7 hover:text-white ${isActive(path) ? 'bg-white/12 text-white' : 'text-zinc-300'}`} href={path}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Button variant="ghost" size="icon" className="text-zinc-200 hover:bg-white/5 md:hidden" onClick={() => setShowMenu(!showMenu)}>
          {showMenu ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>

        <div className="hidden items-center gap-2.5 md:flex">
          <WalletButton />
          <ThemeSelect />
        </div>
        <AnimatePresence>
          {showMenu && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-x-0 top-16 bottom-0 bg-black/96 backdrop-blur-xl md:hidden"
            >
              <div className="flex flex-col gap-4 border-t border-white/10 p-4">
                <ul className="flex flex-col gap-2">
                  {links.map(({ label, path }) => (
                    <li key={path}>
                      <Link
                        className={`block rounded-lg px-3 py-3 text-base transition-colors hover:bg-white/8 hover:text-white ${isActive(path) ? 'bg-white/12 text-white' : 'text-zinc-300'}`}
                        href={path}
                        onClick={() => setShowMenu(false)}
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-3">
                  <Button asChild variant="shine" className="justify-center font-semibold">
                    <Link href="/onboarding" onClick={() => setShowMenu(false)}>
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <WalletButton />
                  <ThemeSelect />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}
