import type { Metadata } from 'next'
import { Manrope, Sora } from 'next/font/google'
import './globals.css'
import { AppProviders } from '@/components/app-providers'
import { AppLayout } from '@/components/app-layout'
import React from 'react'

const fontSans = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
})

const fontDisplay = Sora({
  subsets: ['latin'],
  variable: '--font-display',
})

export const metadata: Metadata = {
  title: {
    default: 'SolZk',
    template: '%s | SolZk',
  },
  description: 'Anonymous whistleblower reporting on Solana with encrypted payloads and zero-knowledge membership proofs.',
}

const links: { label: string; path: string }[] = [
  { label: 'Home', path: '/' },
  { label: 'Onboarding', path: '/onboarding' },
  { label: 'Report', path: '/report' },
  { label: 'Admin', path: '/admin' },
]

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontSans.variable} ${fontDisplay.variable} antialiased`}>
        <AppProviders>
          <AppLayout links={links}>{children}</AppLayout>
        </AppProviders>
      </body>
    </html>
  )
}
// Patch BigInt so we can log it using JSON.stringify without any errors
declare global {
  interface BigInt {
    toJSON(): string
  }
}

BigInt.prototype.toJSON = function () {
  return this.toString()
}
