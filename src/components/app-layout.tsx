'use client'

import { usePathname } from 'next/navigation'
import React from 'react'
import { ThemeProvider } from './theme-provider'
import { Toaster } from './ui/sonner'
import { AppHeader } from '@/components/app-header'
import { AppFooter } from '@/components/app-footer'
import { ClusterChecker } from '@/components/cluster/cluster-ui'
import { AccountChecker } from '@/components/account/account-ui'
import { LiveBackdrop } from '@/components/live-backdrop'

export function AppLayout({
  children,
  links,
}: {
  children: React.ReactNode
  links: { label: string; path: string }[]
}) {
  const pathname = usePathname()
  const shouldShowSolanaStatus =
    pathname.startsWith('/account') || pathname.startsWith('/admin') || pathname.startsWith('/report')

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="pointer-events-none absolute inset-0 z-0">
          <LiveBackdrop />
        </div>
        <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_32%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.6))]" />
        <div className="relative z-20 flex min-h-screen flex-col">
          <AppHeader links={links} />
          <main className="mx-auto w-full max-w-7xl grow px-4 py-6 sm:px-6 lg:px-8">
            {shouldShowSolanaStatus ? (
              <ClusterChecker>
                <AccountChecker />
              </ClusterChecker>
            ) : null}
            {children}
          </main>
          <AppFooter />
        </div>
      </div>
      <Toaster />
    </ThemeProvider>
  )
}
