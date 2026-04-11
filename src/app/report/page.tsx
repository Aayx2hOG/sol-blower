'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Reveal, Stagger, StaggerItem } from '@/components/ui/reveal'
import { SpotlightCard } from '@/components/ui/spotlight-card'
import { useCluster } from '@/components/cluster/cluster-data-access'
import { createWalletChallengeMessage, encodeSignatureBase64 } from '@/lib/reporting/membership'
import { encryptReportPayload, generateProofCommitment } from '@/lib/reporting/crypto'
import { submitReportMemo } from '@/lib/reporting/solana'
import type { AttestReportRequest, MembershipCredential, ReportDraft } from '@/lib/reporting/types'

function isMembershipCredential(value: unknown): value is MembershipCredential {
    if (!value || typeof value !== 'object') {
        return false
    }

    const credential = value as MembershipCredential
    return Boolean(
        credential.payload &&
        typeof credential.payload.version === 'number' &&
        typeof credential.payload.credentialId === 'string' &&
        typeof credential.payload.org === 'string' &&
        typeof credential.payload.epoch === 'string' &&
        typeof credential.payload.walletAddress === 'string' &&
        typeof credential.payload.issuedAt === 'string' &&
        typeof credential.payload.expiresAt === 'string' &&
        typeof credential.issuerPublicKey === 'string' &&
        typeof credential.adminSignatureBase64 === 'string',
    )
}

export default function ReportPage() {
    const { connection } = useConnection()
    const wallet = useWallet()
    const router = useRouter()
    const { getExplorerUrl } = useCluster()

    const [formData, setFormData] = useState<ReportDraft>({
        org: '',
        epoch: '',
        title: '',
        details: '',
    })
    const [proofReady, setProofReady] = useState(false)
    const [encrypted, setEncrypted] = useState(false)
    const [proofCommitment, setProofCommitment] = useState('')
    const [encryptedPayloadHash, setEncryptedPayloadHash] = useState('')
    const [encryptionIvB64, setEncryptionIvB64] = useState('')
    const [encryptionKeyB64, setEncryptionKeyB64] = useState('')
    const [txSignature, setTxSignature] = useState('')
    const [attestationId, setAttestationId] = useState('')
    const [backendVerified, setBackendVerified] = useState(false)
    const [membershipCredential, setMembershipCredential] = useState<MembershipCredential | null>(null)
    const [membershipFileName, setMembershipFileName] = useState('')
    const [isGenerating, setIsGenerating] = useState(false)
    const [isEncrypting, setIsEncrypting] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [membershipPendingOrg, setMembershipPendingOrg] = useState('')

    function updateField(field: keyof typeof formData, value: string) {
        setFormData((prev) => ({ ...prev, [field]: value }))
    }

    async function handleCredentialFileUpload(file: File | null) {
        if (!file) {
            return
        }

        try {
            const rawText = await file.text()
            const parsed = JSON.parse(rawText) as unknown

            if (!isMembershipCredential(parsed)) {
                toast.error('Invalid membership.json format.')
                return
            }

            setMembershipCredential(parsed)
            setMembershipFileName(file.name)
            setFormData((prev) => ({
                ...prev,
                org: parsed.payload.org,
                epoch: parsed.payload.epoch,
            }))
            setTxSignature('')
            setAttestationId('')
            setBackendVerified(false)

            toast.success('Membership credential loaded.', {
                description: `Org ${parsed.payload.org} | Epoch ${parsed.payload.epoch}`,
            })
        } catch (error) {
            toast.error('Unable to read membership.json. Check file format.')
            console.error(error)
        }
    }

    async function attestReportOnBackend(input: AttestReportRequest) {
        const response = await fetch('/api/report/attest', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
        })

        const payload = (await response.json()) as
            | { ok: true; record: { id: string } }
            | { ok: false; error: string }

        if (!response.ok || !payload.ok) {
            throw new Error(payload.ok ? 'Attestation failed.' : payload.error)
        }

        return payload.record.id
    }

    async function checkOnboardingStatus() {
        if (!wallet.publicKey) {
            return null
        }

        try {
            const response = await fetch(`/api/onboarding/state?walletAddress=${encodeURIComponent(wallet.publicKey.toBase58())}`)
            const payload = (await response.json()) as
                | { ok: true; profile: { role: 'admin' | 'reporter'; membershipStatus: 'pending' | 'approved'; org: string } | null }
                | { ok: false; error: string }

            if (!response.ok || !payload.ok) {
                return null
            }

            if (!payload.profile) {
                router.push('/onboarding')
                return null
            }

            if (payload.profile.role === 'admin') {
                router.push('/admin')
                return null
            }

            if (payload.profile.membershipStatus === 'pending') {
                setMembershipPendingOrg(payload.profile.org)
                return payload.profile.org
            }

            setMembershipPendingOrg('')
            return null
        } catch {
            // Non-blocking onboarding status check.
            return null
        }
    }

    async function handleGenerateProof() {
        const pendingOrg = await checkOnboardingStatus()

        if (pendingOrg) {
            toast.error('Your join request is pending admin approval. Proof generation is disabled until approval.')
            return
        }

        if (!wallet.publicKey) {
            toast.error('Connect your wallet before generating a proof commitment.')
            return
        }

        if (!membershipCredential) {
            toast.error('Upload membership.json first to load organization and membership epoch.')
            return
        }

        const credentialOrg = membershipCredential.payload.org.trim()
        const credentialEpoch = membershipCredential.payload.epoch.trim()

        if (!credentialOrg || !credentialEpoch) {
            toast.error('membership.json is missing organization or epoch.')
            return
        }

        setFormData((prev) => ({
            ...prev,
            org: credentialOrg,
            epoch: credentialEpoch,
        }))

        try {
            setIsGenerating(true)

            const result = await generateProofCommitment({
                draft: formData,
                walletAddress: wallet.publicKey.toBase58(),
            })

            setProofCommitment(result.commitment)
            setTxSignature('')
            setAttestationId('')
            setBackendVerified(false)
            toast.success('Proof commitment generated.', {
                description: `${result.commitment.slice(0, 16)}...${result.commitment.slice(-10)}`,
            })
        } catch (error) {
            toast.error('Failed to generate proof commitment.')
            console.error(error)
            return
        } finally {
            setIsGenerating(false)
        }

        setProofReady(true)
        setEncrypted(false)
    }

    async function handleEncryptPayload() {
        if (!proofReady) {
            toast.error('Generate proof before encrypting payload.')
            return
        }

        if (!formData.title.trim() || !formData.details.trim()) {
            toast.error('Add report title and details before encryption.')
            return
        }

        try {
            setIsEncrypting(true)

            const result = await encryptReportPayload({
                draft: formData,
                proofCommitment,
            })

            setEncryptedPayloadHash(result.payloadHash)
            setEncryptionIvB64(result.ivBase64)
            setEncryptionKeyB64(result.keyBase64)
            setTxSignature('')
            setAttestationId('')
            setBackendVerified(false)
            toast.success('Payload encrypted with AES-GCM.', {
                description: 'Store the local key securely before production rollout.',
            })
        } catch (error) {
            toast.error('Failed to encrypt payload.')
            console.error(error)
            return
        } finally {
            setIsEncrypting(false)
        }

        setEncrypted(true)
    }

    async function handleSubmitReport(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (!proofReady || !encrypted) {
            toast.error('Generate proof and encrypt payload before submit.')
            return
        }

        if (!wallet.publicKey) {
            toast.error('Connect your wallet before submitting to Solana.')
            return
        }

        if (!proofCommitment || !encryptedPayloadHash || !encryptionIvB64) {
            toast.error('Missing cryptographic metadata. Regenerate proof and encryption.')
            return
        }

        if (!wallet.sendTransaction) {
            toast.error('Wallet does not support transaction sending in this environment.')
            return
        }

        if (!wallet.signMessage) {
            toast.error('Wallet does not support message signing in this environment.')
            return
        }

        if (!membershipCredential) {
            toast.error('Upload your membership.json file before submitting.')
            return
        }

        try {
            setIsSubmitting(true)

            const signature = await submitReportMemo({
                connection,
                walletPublicKey: wallet.publicKey,
                sendTransaction: wallet.sendTransaction,
                input: {
                    draft: formData,
                    proofCommitment,
                    encryptedPayloadHash,
                    ivBase64: encryptionIvB64,
                },
            })

            const challenge = {
                nonce: crypto.randomUUID(),
                issuedAt: new Date().toISOString(),
            }

            const challengeMessage = createWalletChallengeMessage({
                walletAddress: wallet.publicKey.toBase58(),
                txSignature: signature,
                proofCommitment,
                encryptedPayloadHash,
                org: formData.org.trim(),
                epoch: formData.epoch.trim(),
                challenge,
            })

            const walletSignatureBytes = await wallet.signMessage(new TextEncoder().encode(challengeMessage))
            const walletSignatureBase64 = encodeSignatureBase64(walletSignatureBytes)
            setTxSignature(signature)
            toast.success('Report metadata committed on Solana.', {
                description: `${signature.slice(0, 10)}...${signature.slice(-10)}`,
            })

            const reportAttestationId = await attestReportOnBackend({
                draft: formData,
                walletAddress: wallet.publicKey.toBase58(),
                membershipCredential,
                walletChallenge: challenge,
                walletSignatureBase64,
                txSignature: signature,
                proofCommitment,
                encryptedPayloadHash,
                ivBase64: encryptionIvB64,
            })

            setAttestationId(reportAttestationId)
            setBackendVerified(true)
            toast.success('Backend attestation verified.', {
                description: `Attestation id: ${reportAttestationId}`,
            })
        } catch (error) {
            toast.error('Submission or backend verification failed.')
            console.error(error)
            return
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="space-y-8 pb-14 pt-5 sm:space-y-10 lg:pt-8">
            <Reveal>
                <section className="glass-panel relative overflow-hidden p-6 sm:p-8">
                    <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-white/8 blur-3xl" />
                    <div className="relative z-10 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-200">
                        <ShieldCheck className="h-4 w-4" />
                        Reporter workspace
                    </div>
                    <h1 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
                        Submit a report without exposing your identity.
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                        The reporter app will generate membership proofs, encrypt the payload client-side, and send only the
                        required commitments to Solana.
                    </p>

                    {membershipPendingOrg ? (
                        <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                            Membership for {membershipPendingOrg} is pending admin approval. You can draft details now, and generate proof after approval.
                        </p>
                    ) : null}

                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <Button asChild variant="shine" className="font-semibold">
                            <Link href="#submission-form">
                                Begin submission
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                        <Button asChild variant="soft" className="font-semibold">
                            <Link href="#submission-checklist">Review checklist</Link>
                        </Button>
                    </div>
                </section>
            </Reveal>

            <Reveal>
                <section id="submission-checklist" className="elevated-panel p-6 sm:p-7">
                    <h2 className="text-xl font-semibold text-white sm:text-2xl">Submission checklist</h2>
                    <Stagger className="mt-4 grid gap-3 text-sm leading-6 text-zinc-300 sm:grid-cols-2">
                        <StaggerItem>
                            <SpotlightCard className="rounded-xl bg-white/4 p-4">1. Connect a supported Solana wallet for org membership checks.</SpotlightCard>
                        </StaggerItem>
                        <StaggerItem>
                            <SpotlightCard className="rounded-xl bg-white/4 p-4">2. Generate a proof bound to the active org root and epoch.</SpotlightCard>
                        </StaggerItem>
                        <StaggerItem>
                            <SpotlightCard className="rounded-xl bg-white/4 p-4">3. Encrypt the report payload locally before broadcasting.</SpotlightCard>
                        </StaggerItem>
                        <StaggerItem>
                            <SpotlightCard className="rounded-xl bg-white/4 p-4">4. Submit with a nullifier and refundable anti-spam bond.</SpotlightCard>
                        </StaggerItem>
                    </Stagger>
                </section>
            </Reveal>

            <Reveal>
                <section id="submission-form">
                    <form onSubmit={handleSubmitReport} className="glass-panel space-y-6 p-6 sm:p-7">
                        <div>
                            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Report submission draft</h2>
                            <p className="mt-2 text-sm leading-6 text-zinc-300">Designed for proof/encryption pipeline wiring and Anchor instruction integration.</p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="org">Organization</Label>
                            <Input
                                id="org"
                                placeholder="Auto-filled from membership.json"
                                className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500"
                                value={formData.org}
                                onChange={(event) => updateField('org', event.target.value)}
                                readOnly
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="title">Report title</Label>
                            <Input
                                id="title"
                                placeholder="Unauthorized treasury transfer pattern"
                                className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white placeholder:text-zinc-500"
                                value={formData.title}
                                onChange={(event) => updateField('title', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="details">Encrypted payload draft</Label>
                            <textarea
                                id="details"
                                rows={8}
                                className="w-full rounded-xl border border-white/15 bg-zinc-950/70 px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-white/35"
                                placeholder="Describe the issue, attach references, and encrypt locally before submission."
                                value={formData.details}
                                onChange={(event) => updateField('details', event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="credential-file">Membership credential file</Label>
                            <Input
                                id="credential-file"
                                type="file"
                                accept="application/json,.json"
                                className="h-11 rounded-xl border-white/15 bg-zinc-950/70 text-white file:mr-4 file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-900"
                                onChange={(event) => {
                                    const selectedFile = event.target.files?.[0] ?? null
                                    void handleCredentialFileUpload(selectedFile)
                                }}
                            />
                            <p className="text-xs text-zinc-400">
                                Upload the admin-issued <strong>membership.json</strong> file.
                                {membershipCredential && membershipFileName
                                    ? ` Loaded: ${membershipFileName}`
                                    : ' No file uploaded yet.'}
                            </p>
                            {membershipCredential ? (
                                <p className="text-xs text-zinc-400">
                                    Membership epoch: {membershipCredential.payload.epoch}
                                </p>
                            ) : null}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Button type="button" onClick={handleGenerateProof} disabled={isGenerating || isEncrypting || isSubmitting} variant="shine" className="h-11 font-semibold">
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    'Generate proof'
                                )}
                            </Button>
                            <Button type="button" onClick={handleEncryptPayload} disabled={!proofReady || isGenerating || isEncrypting || isSubmitting} variant="soft" className="h-11">
                                {isEncrypting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Encrypting...
                                    </>
                                ) : (
                                    'Encrypt payload'
                                )}
                            </Button>
                            <Button type="submit" disabled={!encrypted || isGenerating || isEncrypting || isSubmitting} variant="soft" className="h-11">
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit to Solana'
                                )}
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1 text-xs">
                            <span className={`rounded-full border px-3 py-1 ${proofReady ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-white/5 text-zinc-400'}`}>
                                Proof: {proofReady ? 'Ready' : 'Pending'}
                            </span>
                            <span className={`rounded-full border px-3 py-1 ${encrypted ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-white/5 text-zinc-400'}`}>
                                Payload: {encrypted ? 'Encrypted' : 'Not encrypted'}
                            </span>
                            <span className={`rounded-full border px-3 py-1 ${txSignature ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-white/5 text-zinc-400'}`}>
                                Chain: {txSignature ? 'Committed' : 'Not committed'}
                            </span>
                            <span className={`rounded-full border px-3 py-1 ${backendVerified ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/15 bg-white/5 text-zinc-400'}`}>
                                Backend: {backendVerified ? 'Verified' : 'Not verified'}
                            </span>
                        </div>
                        {proofCommitment ? (
                            <p className="text-xs text-zinc-400">
                                Proof commitment: {proofCommitment.slice(0, 20)}...{proofCommitment.slice(-14)}
                            </p>
                        ) : null}
                        {encryptedPayloadHash ? (
                            <p className="text-xs text-zinc-400">
                                Ciphertext hash: {encryptedPayloadHash.slice(0, 20)}...{encryptedPayloadHash.slice(-14)}
                            </p>
                        ) : null}
                        {encryptionKeyB64 ? (
                            <p className="text-xs text-amber-200/90">
                                Local encryption key (store securely): {encryptionKeyB64.slice(0, 12)}...{encryptionKeyB64.slice(-8)}
                            </p>
                        ) : null}
                        {txSignature ? (
                            <a
                                href={getExplorerUrl(`tx/${txSignature}`)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-zinc-200 underline underline-offset-4 hover:text-white"
                            >
                                Verify transaction on Solana Explorer
                            </a>
                        ) : null}
                        {attestationId ? <p className="text-xs text-zinc-400">Backend attestation id: {attestationId}</p> : null}
                    </form>
                </section>
            </Reveal>
        </div>
    )
}