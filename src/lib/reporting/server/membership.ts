import { createPrivateKey, createPublicKey, sign as signMessage, verify as verifySignature } from 'node:crypto'

import { Keypair, PublicKey } from '@solana/web3.js'

import { getOrgAdminPublicKey, getOrgAdminSecretSeed } from '@/lib/reporting/server/repository'
import { getAdminSecretSeedFromEnv } from '@/lib/reporting/server/admin-auth'
import type { MembershipCredential, MembershipCredentialPayload, WalletChallenge } from '@/lib/reporting/types'

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

function safeJsonParse<T>(input: string): T | null {
    try {
        return JSON.parse(input) as T
    } catch {
        return null
    }
}

function buildEd25519PublicKey(base58PublicKey: string) {
    const keyBytes = new PublicKey(base58PublicKey).toBytes()
    const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(keyBytes)])
    return createPublicKey({
        key: spkiDer,
        format: 'der',
        type: 'spki',
    })
}

function normalizeSecretKeySeed(secret: string) {
    const maybeArray = safeJsonParse<number[]>(secret)
    if (Array.isArray(maybeArray) && maybeArray.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
        const asBytes = Uint8Array.from(maybeArray)
        if (asBytes.length === 64) {
            return asBytes.slice(0, 32)
        }
        if (asBytes.length === 32) {
            return asBytes
        }
    }

    const base64Bytes = Buffer.from(secret, 'base64')
    if (base64Bytes.length === 64) {
        return new Uint8Array(base64Bytes.subarray(0, 32))
    }
    if (base64Bytes.length === 32) {
        return new Uint8Array(base64Bytes)
    }

    return null
}

export function createWalletChallengeMessage({
    walletAddress,
    txSignature,
    proofCommitment,
    encryptedPayloadHash,
    org,
    epoch,
    challenge,
}: {
    walletAddress: string
    txSignature: string
    proofCommitment: string
    encryptedPayloadHash: string
    org: string
    epoch: string
    challenge: WalletChallenge
}) {
    return [
        'sol-zk-attest-v1',
        walletAddress,
        txSignature,
        proofCommitment,
        encryptedPayloadHash,
        org,
        epoch,
        challenge.nonce,
        challenge.issuedAt,
    ].join('|')
}

function verifyDetachedSignature({ message, signatureBase64, publicKeyBase58 }: { message: string; signatureBase64: string; publicKeyBase58: string }) {
    try {
        const key = buildEd25519PublicKey(publicKeyBase58)
        const signature = Buffer.from(signatureBase64, 'base64')
        return verifySignature(null, Buffer.from(message, 'utf8'), key, signature)
    } catch {
        return false
    }
}

export function verifyMembershipCredential({
    credential,
    walletAddress,
    org,
    epoch,
}: {
    credential: MembershipCredential
    walletAddress: string
    org: string
    epoch: string
}) {
    if (credential.payload.version !== 1) {
        return { ok: false, reason: 'Unsupported credential version.' } as const
    }

    if (credential.payload.walletAddress !== walletAddress) {
        return { ok: false, reason: 'Credential wallet does not match connected wallet.' } as const
    }

    if (credential.payload.org !== org || credential.payload.epoch !== epoch) {
        return { ok: false, reason: 'Credential org or epoch mismatch.' } as const
    }

    const expiresAtMs = Date.parse(credential.payload.expiresAt)
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
        return { ok: false, reason: 'Credential is expired or invalid.' } as const
    }

    const trustedAdminKey = getOrgAdminPublicKey(org)
    if (!trustedAdminKey) {
        return {
            ok: false,
            reason: 'Org admin key is not configured for this organization.',
        } as const
    }

    if (credential.issuerPublicKey !== trustedAdminKey) {
        return { ok: false, reason: 'Credential issuer is not the trusted org admin key.' } as const
    }

    const signedPayload = JSON.stringify(credential.payload)
    const signatureOk = verifyDetachedSignature({
        message: signedPayload,
        signatureBase64: credential.adminSignatureBase64,
        publicKeyBase58: credential.issuerPublicKey,
    })

    if (!signatureOk) {
        return { ok: false, reason: 'Invalid admin signature on membership credential.' } as const
    }

    return {
        ok: true,
        credentialId: credential.payload.credentialId,
    } as const
}

export function verifyWalletChallengeSignature({
    walletAddress,
    message,
    signatureBase64,
}: {
    walletAddress: string
    message: string
    signatureBase64: string
}) {
    const ok = verifyDetachedSignature({
        message,
        signatureBase64,
        publicKeyBase58: walletAddress,
    })

    if (!ok) {
        return { ok: false, reason: 'Wallet signature challenge failed.' } as const
    }

    return { ok: true } as const
}

function buildEd25519PrivateKey(seed: Uint8Array) {
    const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seed)])
    return createPrivateKey({
        key: pkcs8Der,
        format: 'der',
        type: 'pkcs8',
    })
}

export function issueMembershipCredential({
    org,
    epoch,
    walletAddress,
    ttlDays,
}: {
    org: string
    epoch: string
    walletAddress: string
    ttlDays?: number
}) {
    // SECURITY: Try environment variable first, then fall back to repository
    let secret = getAdminSecretSeedFromEnv(org)
    if (!secret) {
        secret = getOrgAdminSecretSeed(org)
    }

    if (!secret) {
        return {
            ok: false,
            reason: 'Org admin secret key is not configured for this organization.',
        } as const
    }

    const seed = normalizeSecretKeySeed(secret)
    if (!seed) {
        return {
            ok: false,
            reason: 'Org admin secret key format is invalid. Use 32/64-byte base64 or byte array JSON.',
        } as const
    }

    let memberAddress: string
    try {
        memberAddress = new PublicKey(walletAddress).toBase58()
    } catch {
        return { ok: false, reason: 'Invalid member wallet address.' } as const
    }

    const adminKeypair = Keypair.fromSeed(seed)
    const nowIso = new Date().toISOString()
    const validDays = Math.min(365, Math.max(1, ttlDays ?? 90))
    const expiresAtIso = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()

    const payload: MembershipCredentialPayload = {
        version: 1,
        credentialId: crypto.randomUUID(),
        org,
        epoch,
        walletAddress: memberAddress,
        issuedAt: nowIso,
        expiresAt: expiresAtIso,
    }

    const message = Buffer.from(JSON.stringify(payload), 'utf8')
    const privateKey = buildEd25519PrivateKey(seed)
    const adminSignatureBase64 = signMessage(null, message, privateKey).toString('base64')

    const credential: MembershipCredential = {
        payload,
        issuerPublicKey: adminKeypair.publicKey.toBase58(),
        adminSignatureBase64,
    }

    return {
        ok: true,
        credential,
        suggestedFileName: `membership-${org.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${memberAddress.slice(0, 8)}.json`,
    } as const
}
