'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useWallet } from '@solana/wallet-adapter-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MembershipRegistrationRequestRecord, OrgRecord, UserProfileRecord } from '@/lib/reporting/types'

type OnboardingStateResponse = {
    ok: true
    profile: UserProfileRecord | null
    orgs: OrgRecord[]
    myRequests: MembershipRegistrationRequestRecord[]
}

function getCurrentQuarterEpoch() {
    const now = new Date()
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1
    return `${now.getUTCFullYear()}-Q${quarter}`
}

export default function OnboardingPage() {
    const wallet = useWallet()
    const router = useRouter()

    const [orgs, setOrgs] = useState<OrgRecord[]>([])
    const [selectedOrgSlug, setSelectedOrgSlug] = useState('')
    const [orgName, setOrgName] = useState('')
    const [profile, setProfile] = useState<UserProfileRecord | null>(null)
    const [myRequests, setMyRequests] = useState<MembershipRegistrationRequestRecord[]>([])
    const [loadingState, setLoadingState] = useState(false)
    const [joiningOrg, setJoiningOrg] = useState(false)
    const [creatingOrg, setCreatingOrg] = useState(false)

    const walletAddress = wallet.publicKey?.toBase58() ?? ''

    const latestPendingRequest = useMemo(
        () => myRequests.find((request) => request.status === 'pending'),
        [myRequests],
    )

    useEffect(() => {
        if (!walletAddress) {
            return
        }

        let cancelled = false

        async function loadState() {
            try {
                setLoadingState(true)
                const response = await fetch(`/api/onboarding/state?walletAddress=${encodeURIComponent(walletAddress)}`)
                const payload = (await response.json()) as OnboardingStateResponse | { ok: false; error: string }

                if (!response.ok || !payload.ok) {
                    throw new Error(payload.ok ? 'Unable to load onboarding state.' : payload.error)
                }

                if (cancelled) {
                    return
                }

                setProfile(payload.profile)
                setOrgs(payload.orgs)
                setMyRequests(payload.myRequests)

                if (payload.profile?.role === 'reporter' && payload.profile.membershipStatus === 'approved') {
                    router.replace('/report')
                    return
                }

                if (!selectedOrgSlug && payload.orgs.length > 0) {
                    setSelectedOrgSlug(payload.orgs[0].slug)
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unable to load onboarding state.'
                toast.error(message)
            } finally {
                if (!cancelled) {
                    setLoadingState(false)
                }
            }
        }

        void loadState()

        return () => {
            cancelled = true
        }
    }, [router, selectedOrgSlug, walletAddress])

    async function handleJoinOrg() {
        if (!walletAddress) {
            toast.error('Connect wallet before joining an organization.')
            return
        }

        if (!selectedOrgSlug) {
            toast.error('Select an organization first.')
            return
        }

        try {
            setJoiningOrg(true)
            const response = await fetch('/api/onboarding/join-org', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress,
                    orgSlug: selectedOrgSlug,
                }),
            })

            const payload = (await response.json()) as
                | { ok: true; registrationRequest: MembershipRegistrationRequestRecord }
                | { ok: false; error: string }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Failed to join organization.' : payload.error)
            }

            toast.success('Join request submitted.', {
                description: 'An admin must approve your membership before report access is fully enabled.',
            })
            router.replace('/report')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to join organization.'
            toast.error(message)
        } finally {
            setJoiningOrg(false)
        }
    }

    async function handleCreateOrg() {
        if (!walletAddress) {
            toast.error('Connect wallet before creating an organization.')
            return
        }

        if (!orgName.trim()) {
            toast.error('Add an organization name.')
            return
        }

        try {
            setCreatingOrg(true)
            const response = await fetch('/api/onboarding/create-org', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    walletAddress,
                    orgName: orgName.trim(),
                    suggestedEpoch: getCurrentQuarterEpoch(),
                }),
            })

            const payload = (await response.json()) as
                | { ok: true; org: OrgRecord }
                | { ok: false; error: string }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Failed to create organization.' : payload.error)
            }

            toast.success('Organization created. You are now the admin.')
            router.replace('/admin')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create organization.'
            toast.error(message)
        } finally {
            setCreatingOrg(false)
        }
    }

    if (!walletAddress) {
        return (
            <section className="glass-panel mx-auto max-w-3xl space-y-4 p-6 sm:p-7">
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">Choose your path</h1>
                <p className="text-sm leading-6 text-zinc-300">
                    Connect your wallet to continue with onboarding.
                </p>
            </section>
        )
    }

    return (
        <section className="mx-auto grid max-w-5xl gap-5 pb-12 pt-4 sm:grid-cols-2">
            <div className="glass-panel space-y-5 p-6 sm:p-7">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Option A</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Join existing organization</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                        Choose an existing org and request membership approval.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="orgSelect">Organization</Label>
                    <select
                        id="orgSelect"
                        value={selectedOrgSlug}
                        onChange={(event) => setSelectedOrgSlug(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/15 bg-zinc-950/70 px-3 text-sm text-white outline-none focus:border-white/35"
                    >
                        {orgs.length === 0 ? <option value="">No organizations yet</option> : null}
                        {orgs.map((orgItem) => (
                            <option key={orgItem.id} value={orgItem.slug}>
                                {orgItem.name}
                            </option>
                        ))}
                    </select>
                </div>

                <Button
                    type="button"
                    variant="soft"
                    className="h-11"
                    disabled={joiningOrg || creatingOrg || orgs.length === 0 || loadingState}
                    onClick={handleJoinOrg}
                >
                    {joiningOrg ? 'Submitting request...' : 'Join organization'}
                </Button>

                {latestPendingRequest ? (
                    <p className="text-xs text-zinc-400">
                        Pending request: {latestPendingRequest.org} ({latestPendingRequest.id.slice(0, 8)}...)
                    </p>
                ) : null}
            </div>

            <div className="elevated-panel space-y-5 p-6 sm:p-7">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Option B</p>
                    <h2 className="mt-2 text-2xl font-semibold text-white">Create your own organization</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                        Start a new org in this app and become the admin.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="orgName">Organization name</Label>
                    <Input
                        id="orgName"
                        value={orgName}
                        onChange={(event) => setOrgName(event.target.value)}
                        placeholder="Acme Security Collective"
                        className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500"
                    />
                </div>

                <p className="text-xs text-zinc-400">Initial epoch will default to {getCurrentQuarterEpoch()}.</p>

                <Button
                    type="button"
                    variant="shine"
                    className="h-11 font-semibold"
                    disabled={joiningOrg || creatingOrg || loadingState}
                    onClick={handleCreateOrg}
                >
                    {creatingOrg ? 'Creating organization...' : 'Create organization'}
                </Button>
            </div>

            {profile ? (
                <p className="col-span-full text-xs text-zinc-500">
                    Existing profile detected: role {profile.role}, org {profile.org}, membership {profile.membershipStatus}.
                </p>
            ) : null}
        </section>
    )
}
