'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { IssueMembershipCredentialResponse, MembershipRegistrationRequestRecord } from '@/lib/reporting/types'

function getCurrentQuarterEpoch() {
    const now = new Date()
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1
    return `${now.getUTCFullYear()}-Q${quarter}`
}

function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
}

export default function AdminPage() {
    const [org, setOrg] = useState('')
    const [epoch, setEpoch] = useState('')
    const [walletAddress, setWalletAddress] = useState('')
    const [ttlDays, setTtlDays] = useState('90')
    const [issueToken, setIssueToken] = useState('')
    const [isIssuing, setIsIssuing] = useState(false)
    const [isLoadingRequests, setIsLoadingRequests] = useState(false)
    const [isApprovingRequestId, setIsApprovingRequestId] = useState('')
    const [pendingRequests, setPendingRequests] = useState<MembershipRegistrationRequestRecord[]>([])
    const [issuedFileName, setIssuedFileName] = useState('')
    const [approvalEpoch, setApprovalEpoch] = useState(getCurrentQuarterEpoch())

    const hasPendingRequests = useMemo(
        () => pendingRequests.some((request) => request.status === 'pending'),
        [pendingRequests],
    )

    async function loadPendingRequests() {
        if (!issueToken.trim()) {
            toast.error('Add issue token before loading registration requests.')
            return
        }

        try {
            setIsLoadingRequests(true)

            const response = await fetch('/api/membership/register-request', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${issueToken.trim()}`,
                },
            })

            const payload = (await response.json()) as
                | { ok: true; records: MembershipRegistrationRequestRecord[] }
                | { ok: false; error: string }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Unable to load registration requests.' : payload.error)
            }

            setPendingRequests(payload.records)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to load registration requests.'
            toast.error(message)
        } finally {
            setIsLoadingRequests(false)
        }
    }

    async function handleApproveRequest(requestId: string) {
        if (!issueToken.trim()) {
            toast.error('Add issue token before approving requests.')
            return
        }

        if (!approvalEpoch.trim()) {
            toast.error('Add membership epoch before approving requests.')
            return
        }

        const parsedTtl = Number.parseInt(ttlDays, 10)
        if (!Number.isFinite(parsedTtl) || parsedTtl < 1 || parsedTtl > 365) {
            toast.error('TTL must be a number between 1 and 365 days.')
            return
        }

        try {
            setIsApprovingRequestId(requestId)

            const response = await fetch('/api/membership/register-request/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${issueToken.trim()}`,
                },
                body: JSON.stringify({
                    requestId,
                    epoch: approvalEpoch.trim(),
                    ttlDays: parsedTtl,
                }),
            })

            const payload = (await response.json()) as
                | ({ ok: true } & IssueMembershipCredentialResponse)
                | { ok: false; error: string }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Approval failed.' : payload.error)
            }

            setIssuedFileName(payload.suggestedFileName)
            downloadJson(payload.suggestedFileName, payload.credential)
            setPendingRequests((prev) => prev.map((request) => (request.id === requestId ? { ...request, status: 'approved', approvedAt: new Date().toISOString() } : request)))

            toast.success('Request approved and membership.json downloaded.', {
                description: `Credential id: ${payload.credential.payload.credentialId}`,
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Approval failed.'
            toast.error(message)
        } finally {
            setIsApprovingRequestId('')
        }
    }

    async function handleIssueMembership() {
        if (!org.trim() || !epoch.trim() || !walletAddress.trim()) {
            toast.error('Add organization, epoch, and member wallet address first.')
            return
        }

        if (!issueToken.trim()) {
            toast.error('Add issue token before generating membership.json.')
            return
        }

        const parsedTtl = Number.parseInt(ttlDays, 10)
        if (!Number.isFinite(parsedTtl) || parsedTtl < 1 || parsedTtl > 365) {
            toast.error('TTL must be a number between 1 and 365 days.')
            return
        }

        try {
            setIsIssuing(true)

            const response = await fetch('/api/membership/issue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${issueToken.trim()}`,
                },
                body: JSON.stringify({
                    org: org.trim(),
                    epoch: epoch.trim(),
                    walletAddress: walletAddress.trim(),
                    ttlDays: parsedTtl,
                }),
            })

            const payload = (await response.json()) as
                | ({ ok: true } & IssueMembershipCredentialResponse)
                | { ok: false; error: string }

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Credential issuance failed.' : payload.error)
            }

            setIssuedFileName(payload.suggestedFileName)
            downloadJson(payload.suggestedFileName, payload.credential)

            toast.success('membership.json generated and downloaded.', {
                description: `Credential id: ${payload.credential.payload.credentialId}`,
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Credential issuance failed.'
            toast.error(message)
        } finally {
            setIsIssuing(false)
        }
    }

    return (
        <div className="mx-auto grid max-w-5xl gap-5 pb-10 pt-2 lg:grid-cols-[1.1fr,0.9fr]">
            <section className="glass-panel space-y-6 p-6 sm:p-7">
                <div>
                    <h1 className="text-2xl font-semibold text-white sm:text-3xl">Admin membership issuance</h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                        Generate an admin-signed <strong>membership.json</strong> for a member wallet.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="org">Organization</Label>
                        <Input id="org" value={org} onChange={(event) => setOrg(event.target.value)} placeholder="Acme Finance" className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="epoch">Membership epoch</Label>
                        <Input id="epoch" value={epoch} onChange={(event) => setEpoch(event.target.value)} placeholder="2026-Q2" className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500" />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="walletAddress">Member wallet address</Label>
                    <Input id="walletAddress" value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="Member wallet base58" className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="ttlDays">Credential TTL (days)</Label>
                        <Input id="ttlDays" type="number" min={1} max={365} value={ttlDays} onChange={(event) => setTtlDays(event.target.value)} className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500" />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="issueToken">Issue token</Label>
                        <Input id="issueToken" type="password" value={issueToken} onChange={(event) => setIssueToken(event.target.value)} placeholder="REPORT_MEMBERSHIP_ISSUE_TOKEN" className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500" />
                    </div>
                </div>

                <Button type="button" onClick={handleIssueMembership} disabled={isIssuing} variant="shine" className="h-11 font-semibold">
                    {isIssuing ? 'Issuing membership.json...' : 'Issue membership.json'}
                </Button>

                {issuedFileName ? <p className="text-xs text-zinc-400">Last generated file: {issuedFileName}</p> : null}

            </section>

            <section className="elevated-panel space-y-5 p-6 sm:p-7">
                <div>
                    <h2 className="text-xl font-semibold text-white">Approve join requests</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-300">
                        Review pending requests and issue membership.json with one click.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="approvalEpoch">Membership epoch for approvals</Label>
                    <Input
                        id="approvalEpoch"
                        value={approvalEpoch}
                        onChange={(event) => setApprovalEpoch(event.target.value)}
                        placeholder="2026-Q2"
                        className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500"
                    />
                </div>

                <Button type="button" variant="soft" className="h-11" onClick={loadPendingRequests} disabled={isLoadingRequests}>
                    {isLoadingRequests ? 'Loading requests...' : 'Load join requests'}
                </Button>

                {!hasPendingRequests && pendingRequests.length > 0 ? (
                    <p className="text-xs text-zinc-400">No pending requests found.</p>
                ) : null}

                <div className="space-y-3">
                    {pendingRequests
                        .filter((request) => request.status === 'pending')
                        .map((request) => (
                            <div key={request.id} className="rounded-xl border border-white/10 bg-white/4 p-3 text-sm text-zinc-200">
                                <p className="font-medium">Org: {request.org}</p>
                                <p className="mt-1 text-xs text-zinc-400">Wallet: {request.walletAddress}</p>
                                <p className="mt-1 text-xs text-zinc-500">Requested: {new Date(request.createdAt).toLocaleString()}</p>
                                <Button
                                    type="button"
                                    className="mt-3 h-9"
                                    variant="shine"
                                    disabled={Boolean(isApprovingRequestId)}
                                    onClick={() => handleApproveRequest(request.id)}
                                >
                                    {isApprovingRequestId === request.id ? 'Approving...' : 'Approve and issue membership.json'}
                                </Button>
                            </div>
                        ))}
                </div>
            </section>
        </div>
    )
}