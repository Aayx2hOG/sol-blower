'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useWallet } from '@solana/wallet-adapter-react'

import { useCluster } from '@/components/cluster/cluster-data-access'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseApiJson } from '@/lib/reporting/http'
import { createAdminAuthMessage } from '@/lib/reporting/admin-auth'
import { encodeSignatureBase64 } from '@/lib/reporting/membership'
import type { DecryptedReportPayload, IssueMembershipCredentialResponse, MembershipRegistrationRequestRecord, ReportAttestationRecord } from '@/lib/reporting/types'

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
    const wallet = useWallet()
    const { getExplorerUrl } = useCluster()

    const [org, setOrg] = useState('')
    const [epoch, setEpoch] = useState('')
    const [walletAddress, setWalletAddress] = useState('')
    const [ttlDays, setTtlDays] = useState('90')
    const [isIssuing, setIsIssuing] = useState(false)
    const [isLoadingRequests, setIsLoadingRequests] = useState(false)
    const [isLoadingReports, setIsLoadingReports] = useState(false)
    const [isApprovingRequestId, setIsApprovingRequestId] = useState('')
    const [isDecryptingReportId, setIsDecryptingReportId] = useState('')
    const [pendingRequests, setPendingRequests] = useState<MembershipRegistrationRequestRecord[]>([])
    const [recentReports, setRecentReports] = useState<ReportAttestationRecord[]>([])
    const [decryptedByReportId, setDecryptedByReportId] = useState<Record<string, DecryptedReportPayload>>({})
    const [issuedFileName, setIssuedFileName] = useState('')
    const [approvalEpoch, setApprovalEpoch] = useState(getCurrentQuarterEpoch())
    const [adminOrgSlug, setAdminOrgSlug] = useState('')
    const [isAdminWallet, setIsAdminWallet] = useState<boolean | null>(null)

    const hasPendingRequests = useMemo(
        () => pendingRequests.some((request) => request.status === 'pending'),
        [pendingRequests],
    )

    useEffect(() => {
        if (!wallet.publicKey) {
            setAdminOrgSlug('')
            setIsAdminWallet(null)
            return
        }

        let cancelled = false

        async function loadProfile() {
            try {
                const address = wallet.publicKey?.toBase58()
                if (!address) {
                    return
                }

                const response = await fetch(`/api/onboarding/state?walletAddress=${encodeURIComponent(address)}`)
                const payload = await parseApiJson<{
                    ok: true
                    profile: { role: 'admin' | 'reporter'; org: string } | null
                }>(response, 'Unable to load admin profile.')

                if (!response.ok || !payload.ok) {
                    return
                }

                if (cancelled) {
                    return
                }

                const isAdmin = payload.profile?.role === 'admin'
                setIsAdminWallet(isAdmin)
                setAdminOrgSlug(isAdmin ? payload.profile?.org ?? '' : '')

                if (isAdmin && !org.trim() && payload.profile?.org) {
                    setOrg(payload.profile.org)
                }
            } catch {
                // Best-effort profile check.
            }
        }

        void loadProfile()

        return () => {
            cancelled = true
        }
    }, [org, wallet.publicKey])

    async function buildAdminAuthHeaders(action: 'list-requests' | 'approve-request' | 'issue-membership' | 'list-reports' | 'decrypt-report', orgForAuth: string) {
        if (!wallet.publicKey) {
            throw new Error('Connect admin wallet before performing admin actions.')
        }

        if (!wallet.signMessage) {
            throw new Error('Wallet does not support message signing in this environment.')
        }

        const resolvedOrg = orgForAuth.trim()
        if (!resolvedOrg) {
            throw new Error('Organization is required for admin authorization.')
        }

        const walletAddress = wallet.publicKey.toBase58()
        const issuedAt = new Date().toISOString()
        const nonce = crypto.randomUUID()
        const message = createAdminAuthMessage({
            walletAddress,
            org: resolvedOrg,
            issuedAt,
            nonce,
            action,
        })

        const signatureBytes = await wallet.signMessage(new TextEncoder().encode(message))
        const signatureBase64 = encodeSignatureBase64(signatureBytes)

        return {
            'x-admin-wallet-address': walletAddress,
            'x-admin-signature': signatureBase64,
            'x-admin-issued-at': issuedAt,
            'x-admin-nonce': nonce,
        }
    }

    async function loadPendingRequests() {
        const authOrg = org.trim() || adminOrgSlug.trim()
        if (!authOrg) {
            toast.error('Add organization or connect an admin wallet.')
            return
        }

        try {
            setIsLoadingRequests(true)

            const headers = await buildAdminAuthHeaders('list-requests', authOrg)

            const response = await fetch(`/api/membership/register-request?org=${encodeURIComponent(authOrg)}`, {
                method: 'GET',
                headers,
            })

            const payload = await parseApiJson<{ ok: true; records: MembershipRegistrationRequestRecord[] }>(
                response,
                'Unable to load registration requests.',
            )

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Unable to load registration requests.' : payload.error)
            }

            setPendingRequests(payload.records)
            if (!org.trim()) {
                setOrg(authOrg)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to load registration requests.'
            toast.error(message)
        } finally {
            setIsLoadingRequests(false)
        }
    }

    async function handleApproveRequest(requestId: string, requestOrg: string) {
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

            const headers = await buildAdminAuthHeaders('approve-request', requestOrg)

            const response = await fetch('/api/membership/register-request/approve', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({
                    requestId,
                    epoch: approvalEpoch.trim(),
                    ttlDays: parsedTtl,
                }),
            })

            const payload = await parseApiJson<{ ok: true } & IssueMembershipCredentialResponse>(
                response,
                'Approval failed.',
            )

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

    async function loadRecentReports() {
        const authOrg = org.trim() || adminOrgSlug.trim()
        if (!authOrg) {
            toast.error('Add organization or connect an admin wallet.')
            return
        }

        try {
            setIsLoadingReports(true)

            const headers = await buildAdminAuthHeaders('list-reports', authOrg)
            const response = await fetch(`/api/report/attest/list?org=${encodeURIComponent(authOrg)}`, {
                method: 'GET',
                headers,
            })

            const payload = await parseApiJson<{ ok: true; records: ReportAttestationRecord[] }>(
                response,
                'Unable to load report inbox.',
            )

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Unable to load report inbox.' : payload.error)
            }

            setRecentReports(payload.records)
            setDecryptedByReportId({})
            if (!org.trim()) {
                setOrg(authOrg)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to load report inbox.'
            toast.error(message)
        } finally {
            setIsLoadingReports(false)
        }
    }

    async function handleDecryptReport(record: ReportAttestationRecord) {
        try {
            setIsDecryptingReportId(record.id)

            const headers = await buildAdminAuthHeaders('decrypt-report', record.org)
            const response = await fetch(`/api/report/attest/decrypt?id=${encodeURIComponent(record.id)}`, {
                method: 'GET',
                headers,
            })

            const payload = await parseApiJson<{ ok: true; payload: DecryptedReportPayload }>(
                response,
                'Unable to decrypt report payload.',
            )

            if (!response.ok || !payload.ok) {
                throw new Error(payload.ok ? 'Unable to decrypt report payload.' : payload.error)
            }

            setDecryptedByReportId((prev) => ({
                ...prev,
                [record.id]: payload.payload,
            }))
            toast.success('Report decrypted for admin view.')
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to decrypt report payload.'
            toast.error(message)
        } finally {
            setIsDecryptingReportId('')
        }
    }

    async function handleIssueMembership() {
        const resolvedOrg = org.trim() || adminOrgSlug.trim()

        if (!resolvedOrg || !epoch.trim() || !walletAddress.trim()) {
            toast.error('Add organization, epoch, and member wallet address first.')
            return
        }

        const parsedTtl = Number.parseInt(ttlDays, 10)
        if (!Number.isFinite(parsedTtl) || parsedTtl < 1 || parsedTtl > 365) {
            toast.error('TTL must be a number between 1 and 365 days.')
            return
        }

        try {
            setIsIssuing(true)

            const headers = await buildAdminAuthHeaders('issue-membership', resolvedOrg)

            const response = await fetch('/api/membership/issue', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({
                    org: resolvedOrg,
                    epoch: epoch.trim(),
                    walletAddress: walletAddress.trim(),
                    ttlDays: parsedTtl,
                }),
            })

            const payload = await parseApiJson<{ ok: true } & IssueMembershipCredentialResponse>(
                response,
                'Credential issuance failed.',
            )

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

                <p className="rounded-xl border border-white/10 bg-white/4 px-3 py-2 text-xs text-zinc-300">
                    Auth mode: {wallet.publicKey ? 'Wallet signature' : 'Not authenticated'}
                    {wallet.publicKey && isAdminWallet === true ? ` | Admin org: ${adminOrgSlug}` : ''}
                </p>

                {wallet.publicKey && isAdminWallet === false ? (
                    <p className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        Connected wallet is not an admin profile in this app. Switch to your admin wallet.
                    </p>
                ) : null}

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

                <div className="space-y-2">
                    <div className="space-y-2">
                        <Label htmlFor="ttlDays">Credential TTL (days)</Label>
                        <Input id="ttlDays" type="number" min={1} max={365} value={ttlDays} onChange={(event) => setTtlDays(event.target.value)} className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500" />
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
                                    onClick={() => handleApproveRequest(request.id, request.org)}
                                >
                                    {isApprovingRequestId === request.id ? 'Approving...' : 'Approve and issue membership.json'}
                                </Button>
                            </div>
                        ))}
                </div>

                <div className="border-t border-white/10 pt-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-white">Report inbox</h3>
                        <Button type="button" variant="soft" className="h-9" onClick={loadRecentReports} disabled={isLoadingReports}>
                            {isLoadingReports ? 'Loading reports...' : 'Load reports'}
                        </Button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">
                        Shows attested report metadata for your org. Use decrypt to view message content.
                    </p>

                    {recentReports.length === 0 ? <p className="mt-3 text-xs text-zinc-500">No reports loaded yet.</p> : null}

                    <div className="mt-3 space-y-3">
                        {recentReports.map((record) => (
                            <div key={record.id} className="rounded-xl border border-white/10 bg-white/4 p-3 text-sm text-zinc-200">
                                <p className="font-medium">{record.org} | {record.epoch}</p>
                                <p className="mt-1 text-xs text-zinc-400">Submitted: {new Date(record.createdAt).toLocaleString()}</p>
                                <p className="mt-1 text-xs text-zinc-400">Reporter wallet: {record.walletAddress}</p>
                                <p className="mt-1 text-xs text-zinc-500">Commitment: {record.proofCommitment.slice(0, 12)}...{record.proofCommitment.slice(-10)}</p>
                                <p className="mt-1 text-xs text-zinc-500">Cipher hash: {record.encryptedPayloadHash.slice(0, 12)}...{record.encryptedPayloadHash.slice(-10)}</p>
                                <Button
                                    type="button"
                                    variant="soft"
                                    className="mt-3 h-8"
                                    disabled={Boolean(isDecryptingReportId)}
                                    onClick={() => handleDecryptReport(record)}
                                >
                                    {isDecryptingReportId === record.id ? 'Decrypting...' : 'Decrypt message'}
                                </Button>

                                {decryptedByReportId[record.id] ? (
                                    <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                                        <p className="font-semibold">{decryptedByReportId[record.id].title}</p>
                                        <p className="mt-2 whitespace-pre-wrap leading-6 text-emerald-50/95">{decryptedByReportId[record.id].details}</p>
                                    </div>
                                ) : null}

                                <a
                                    href={getExplorerUrl(`tx/${record.txSignature}`)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-block text-xs font-medium text-zinc-200 underline underline-offset-4 hover:text-white"
                                >
                                    View transaction on Solana Explorer
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    )
}