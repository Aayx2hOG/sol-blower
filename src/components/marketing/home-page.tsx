import Link from 'next/link'
import {
    ArrowRight,
    Check,
    Fingerprint,
    LockKeyhole,
    Network,
    UserCheck,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Reveal, Stagger, StaggerItem } from '@/components/ui/reveal'
import { SpotlightCard } from '@/components/ui/spotlight-card'

const features = [
    {
        icon: Fingerprint,
        title: 'Identity-safe membership proofing',
        description: 'Member access is proven using zero-knowledge witness data, never by exposing identity on-chain.',
    },
    {
        icon: LockKeyhole,
        title: 'Client-side encrypted payloads',
        description: 'Report content is encrypted before broadcast, while Solana stores only commitments and metadata.',
    },
    {
        icon: Network,
        title: 'Org- and epoch-bound nullifiers',
        description: 'Replay-resistant submission flow with deterministic one-time nullifier checks on Solana.',
    },
    {
        icon: UserCheck,
        title: 'Controlled reviewer operations',
        description: 'Reviewers can access ciphertext metadata with auditable decryption workflow controls.',
    },
]

const metrics = [
    { value: '100%', label: 'Solana-native' },
    { value: '0', label: 'Identity on-chain' },
    { value: '1x', label: 'Nullifier usage' },
]

export function HomePage() {
    return (
        <div className="space-y-12 pb-16 pt-8 lg:space-y-16">
            <Reveal className="px-2 py-12 text-center sm:px-6 sm:py-16 lg:px-10 lg:py-20">
                <div className="mx-auto max-w-4xl space-y-6">
                    <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-200">
                        Solana-native reporting stack
                    </p>
                    <h1 className="font-mono text-balance text-4xl font-semibold leading-[1.06] tracking-tight text-white sm:text-6xl lg:text-7xl">
                        Expert-grade anonymity for critical disclosures.
                    </h1>
                    <p className="mx-auto max-w-2xl text-pretty text-base leading-8 text-zinc-300 sm:text-xl">
                        Membership-gated reporting, encrypted payload lifecycle, and auditable reviewer operations.
                        Built for organizations that need trust, not marketing fluff.
                    </p>
                    <div className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row sm:justify-center">
                        <Button asChild size="lg" variant="shine" className="min-w-[210px] font-semibold">
                            <Link href="/onboarding">
                                Get Started
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button asChild size="lg" variant="soft" className="min-w-[210px] font-semibold">
                            <Link href="/report">View Reporter Flow</Link>
                        </Button>
                    </div>
                    <Stagger className="mx-auto grid max-w-lg grid-cols-3 gap-2.5">
                        {metrics.map((metric) => (
                            <StaggerItem key={metric.label}>
                                <SpotlightCard className="rounded-md p-3 text-left">
                                    <p className="font-mono text-2xl font-semibold text-white">{metric.value}</p>
                                    <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-zinc-400">{metric.label}</p>
                                </SpotlightCard>
                            </StaggerItem>
                        ))}
                    </Stagger>
                </div>
            </Reveal>

            <Stagger className="grid gap-4 sm:grid-cols-2">
                {features.map((feature, index) => {
                    const Icon = feature.icon
                    return (
                        <StaggerItem key={feature.title}>
                            <SpotlightCard className="group p-5 transition-all hover:-translate-y-0.5 sm:p-6">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 bg-white/6 text-zinc-100">
                                    <Icon className="h-5 w-5" />
                                </div>
                                <h3 className="mt-4 text-lg font-semibold text-white sm:text-xl">{feature.title}</h3>
                                <p className="mt-2 text-sm leading-6 text-zinc-300 sm:text-[15px]">{feature.description}</p>
                                <p className="mt-4 text-xs uppercase tracking-[0.18em] text-zinc-500">Feature 0{index + 1}</p>
                            </SpotlightCard>
                        </StaggerItem>
                    )
                })}
            </Stagger>

            <Reveal>
                <section className="elevated-panel p-6 sm:p-7">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">Operational cadence</p>
                    <h2 className="mt-3 text-2xl font-semibold text-white sm:text-3xl">From membership witness to reviewed case</h2>
                    <ol className="mt-6 grid gap-3 sm:grid-cols-3">
                        {[
                            'An organization registers its profile, encryption key, and membership root.',
                            'A member submits encrypted content with proof and one-time nullifier.',
                            'Review operations process ciphertext metadata with an auditable trail.',
                        ].map((item, index) => (
                            <li key={item} className="rounded-xl border border-white/10 bg-white/4 p-4 text-sm leading-6 text-zinc-300">
                                <span className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/8 text-xs font-semibold text-zinc-100 ring-1 ring-white/20">
                                    {index + 1}
                                </span>
                                <p>{item}</p>
                            </li>
                        ))}
                    </ol>
                </section>
            </Reveal>

            <Reveal>
                <section className="rounded-2xl border border-white/10 bg-black/35 p-6 sm:p-8">
                    <h2 className="text-2xl font-semibold text-white sm:text-3xl">What you get immediately</h2>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {[
                            'Reporter-facing submission UX with proof/encryption flow placeholders',
                            'Solana transaction path prepared for Anchor instruction integration',
                            'Privacy-first submission lifecycle with encrypted payload workflow',
                        ].map((item) => (
                            <SpotlightCard key={item} className="flex items-start gap-2 rounded-lg bg-white/4 p-4 text-sm text-zinc-300">
                                <Check className="mt-0.5 h-4 w-4 shrink-0 text-zinc-100" />
                                <p>{item}</p>
                            </SpotlightCard>
                        ))}
                    </div>
                    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <Button asChild variant="shine" className="font-semibold">
                            <Link href="/report">Go To Reporter App</Link>
                        </Button>
                    </div>
                </section>
            </Reveal>
        </div>
    )
}