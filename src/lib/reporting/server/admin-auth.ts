import { NextRequest } from 'next/server'

import { createAdminAuthMessage, type MembershipAdminAction } from '@/lib/reporting/admin-auth'
import { getUserProfile } from '@/lib/reporting/server/repository'
import { verifyWalletChallengeSignature } from '@/lib/reporting/server/membership'

type AuthorizationResult =
    | { ok: true; mode: 'wallet'; walletAddress: string }
    | { ok: false; reason: string; status: number }

const MAX_CHALLENGE_AGE_MS = 5 * 60 * 1000
const MAX_FUTURE_SKEW_MS = 30 * 1000

// SECURITY: Environment-based admin secret management
// In production, use KMS or secure secret store instead of file persistence
export function getAdminSecretSeedFromEnv(org: string): string | null {
    // Try org-specific env var first: ADMIN_SECRET_SEED_ORGNAME
    const orgNormalized = org.toUpperCase().replace(/[^A-Z0-9]/g, '_')
    const envKey = `ADMIN_SECRET_SEED_${orgNormalized}`
    const envSecret = process.env[envKey]

    if (envSecret) {
        // SECURITY: Log only in development
        if (process.env.NODE_ENV === 'development') {
            console.debug(`Using admin secret from env var: ${envKey}`)
        }
        return envSecret
    }

    // SECURITY: Do NOT fall back to file persistence in production
    if (process.env.NODE_ENV === 'production') {
        console.error(`Admin secret seed not found in environment for org: ${org}. Set ${envKey} in your production secrets.`)
        return null
    }

    // Dev only: Fall back to repository file persistence
    console.warn(`WARNING: Using file-persisted admin secret for ${org}. This is insecure in production.`)
    return null
}

export function authorizeMembershipAdminRequest({
    request,
    org,
    action,
}: {
    request: NextRequest
    org: string
    action: MembershipAdminAction
}): AuthorizationResult {
    const walletAddress = request.headers.get('x-admin-wallet-address')?.trim() ?? ''
    const signatureBase64 = request.headers.get('x-admin-signature')?.trim() ?? ''
    const issuedAt = request.headers.get('x-admin-issued-at')?.trim() ?? ''
    const nonce = request.headers.get('x-admin-nonce')?.trim() ?? ''

    if (!walletAddress || !signatureBase64 || !issuedAt || !nonce) {
        return {
            ok: false,
            reason: 'Unauthorized membership admin request.',
            status: 401,
        }
    }

    const issuedAtMs = Date.parse(issuedAt)
    if (Number.isNaN(issuedAtMs)) {
        return {
            ok: false,
            reason: 'Invalid admin auth timestamp.',
            status: 401,
        }
    }

    const ageMs = Date.now() - issuedAtMs
    if (ageMs < -MAX_FUTURE_SKEW_MS || ageMs > MAX_CHALLENGE_AGE_MS) {
        return {
            ok: false,
            reason: 'Admin auth challenge expired. Please retry.',
            status: 401,
        }
    }

    const profile = getUserProfile(walletAddress)
    if (!profile || profile.role !== 'admin') {
        return {
            ok: false,
            reason: 'Connected wallet is not an admin.',
            status: 403,
        }
    }

    if (profile.org !== org) {
        return {
            ok: false,
            reason: 'Connected admin is not authorized for this organization.',
            status: 403,
        }
    }

    const message = createAdminAuthMessage({
        walletAddress,
        org,
        issuedAt,
        nonce,
        action,
    })

    const signatureCheck = verifyWalletChallengeSignature({
        walletAddress,
        message,
        signatureBase64,
    })

    if (!signatureCheck.ok) {
        return {
            ok: false,
            reason: 'Invalid admin wallet signature.',
            status: 401,
        }
    }

    return {
        ok: true,
        mode: 'wallet',
        walletAddress,
    }
}