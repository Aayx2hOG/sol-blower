import { NextRequest, NextResponse } from 'next/server'

import { createWalletChallengeMessage, verifyMembershipCredential, verifyWalletChallengeSignature } from '@/lib/reporting/server/membership'
import { getReportAttestationBySignature, saveReportAttestation } from '@/lib/reporting/server/repository'
import { verifyMemoAttestation } from '@/lib/reporting/server/verify'
import { jsonUnexpectedError, parseJsonBody } from '@/lib/reporting/server/http'
import type { AttestReportRequest } from '@/lib/reporting/types'

export const runtime = 'nodejs'

function isHex64(input: string) {
    return /^[a-f0-9]{64}$/i.test(input)
}

function isLikelyBase64(input: string) {
    return /^[A-Za-z0-9+/=]+$/.test(input) && input.length > 12
}

function isLikelyIsoDate(input: string) {
    return !Number.isNaN(Date.parse(input))
}

function validateRequest(body: AttestReportRequest) {
    if (!body.txSignature || body.txSignature.length < 40) {
        return 'Invalid transaction signature.'
    }
    if (!body.walletAddress || body.walletAddress.length < 32) {
        return 'Invalid wallet address.'
    }
    if (!isHex64(body.proofCommitment)) {
        return 'Invalid proof commitment format.'
    }
    if (!isHex64(body.encryptedPayloadHash)) {
        return 'Invalid encrypted payload hash format.'
    }
    if (!isLikelyBase64(body.ivBase64)) {
        return 'Invalid IV format.'
    }
    if (!isLikelyBase64(body.ciphertextBase64)) {
        return 'Invalid ciphertext format.'
    }
    if (!isLikelyBase64(body.encryptionKeyBase64)) {
        return 'Invalid encryption key format.'
    }
    if (!isLikelyBase64(body.walletSignatureBase64)) {
        return 'Invalid wallet signature format.'
    }
    if (!body.walletChallenge.nonce || body.walletChallenge.nonce.length < 12) {
        return 'Invalid wallet challenge nonce.'
    }
    if (!isLikelyIsoDate(body.walletChallenge.issuedAt)) {
        return 'Invalid wallet challenge issuedAt.'
    }
    if (!body.membershipCredential.payload.credentialId.trim()) {
        return 'Missing credential id.'
    }
    if (!body.membershipCredential.payload.walletAddress.trim()) {
        return 'Missing credential wallet address.'
    }
    if (!body.membershipCredential.issuerPublicKey.trim()) {
        return 'Missing credential issuer public key.'
    }
    if (!isLikelyBase64(body.membershipCredential.adminSignatureBase64)) {
        return 'Invalid admin credential signature format.'
    }
    if (!body.draft.org.trim() || !body.draft.epoch.trim()) {
        return 'Organization and epoch are required.'
    }
    return null
}

export async function POST(request: NextRequest) {
    try {
        const parsedBody = await parseJsonBody<AttestReportRequest>(request)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const body = parsedBody.data
        const validationError = validateRequest(body)

        if (validationError) {
            return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
        }

        const existing = getReportAttestationBySignature(body.txSignature)
        if (existing) {
            return NextResponse.json({ ok: true, record: existing })
        }

        const verification = await verifyMemoAttestation({
            signature: body.txSignature,
            walletAddress: body.walletAddress,
            proofCommitment: body.proofCommitment,
            encryptedPayloadHash: body.encryptedPayloadHash,
            org: body.draft.org.trim(),
            epoch: body.draft.epoch.trim(),
        })

        if (!verification.ok) {
            return NextResponse.json({ ok: false, error: verification.reason }, { status: 422 })
        }

        const membershipCheck = verifyMembershipCredential({
            credential: body.membershipCredential,
            walletAddress: body.walletAddress,
            org: body.draft.org.trim(),
            epoch: body.draft.epoch.trim(),
        })

        if (!membershipCheck.ok) {
            return NextResponse.json({ ok: false, error: membershipCheck.reason }, { status: 422 })
        }

        const challengeAgeMs = Date.now() - Date.parse(body.walletChallenge.issuedAt)
        if (challengeAgeMs < 0 || challengeAgeMs > 5 * 60 * 1000) {
            return NextResponse.json({ ok: false, error: 'Wallet challenge expired. Please retry submission.' }, { status: 422 })
        }

        const challengeMessage = createWalletChallengeMessage({
            walletAddress: body.walletAddress,
            txSignature: body.txSignature,
            proofCommitment: body.proofCommitment,
            encryptedPayloadHash: body.encryptedPayloadHash,
            org: body.draft.org.trim(),
            epoch: body.draft.epoch.trim(),
            challenge: body.walletChallenge,
        })

        const walletChallengeCheck = verifyWalletChallengeSignature({
            walletAddress: body.walletAddress,
            message: challengeMessage,
            signatureBase64: body.walletSignatureBase64,
        })

        if (!walletChallengeCheck.ok) {
            return NextResponse.json({ ok: false, error: walletChallengeCheck.reason }, { status: 422 })
        }

        const record = saveReportAttestation({
            txSignature: body.txSignature,
            walletAddress: body.walletAddress,
            org: body.draft.org.trim(),
            epoch: body.draft.epoch.trim(),
            proofCommitment: body.proofCommitment,
            encryptedPayloadHash: body.encryptedPayloadHash,
            ivBase64: body.ivBase64,
            ciphertextBase64: body.ciphertextBase64,
            encryptionKeyBase64: body.encryptionKeyBase64,
            memoMatched: verification.memoMatched,
            membershipCredentialId: membershipCheck.credentialId,
            walletChallengeNonce: body.walletChallenge.nonce,
            membershipVerified: true,
        })

        return NextResponse.json({ ok: true, record })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to attest report.')
    }
}

export async function GET(request: NextRequest) {
    try {
        const signature = request.nextUrl.searchParams.get('signature')

        if (!signature) {
            return NextResponse.json({ ok: false, error: 'Missing signature query parameter.' }, { status: 400 })
        }

        const record = getReportAttestationBySignature(signature)
        if (!record) {
            return NextResponse.json({ ok: false, error: 'No attestation found for signature.' }, { status: 404 })
        }

        return NextResponse.json({ ok: true, record })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to read attestation.')
    }
}
