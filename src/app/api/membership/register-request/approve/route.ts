import { NextRequest, NextResponse } from 'next/server'

import { issueMembershipCredential } from '@/lib/reporting/server/membership'
import { getMembershipRegistrationRequestById, markMembershipRegistrationApproved, markUserProfileMembershipApproved } from '@/lib/reporting/server/repository'
import type { ApproveMembershipRegistrationRequest, IssueMembershipCredentialResponse } from '@/lib/reporting/types'

export const runtime = 'nodejs'

function isAuthorized(request: NextRequest) {
    const expectedToken = process.env.REPORT_MEMBERSHIP_ISSUE_TOKEN
    if (!expectedToken) {
        return {
            ok: false,
            reason: 'Missing REPORT_MEMBERSHIP_ISSUE_TOKEN configuration.',
            status: 500,
        } as const
    }

    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token || token !== expectedToken) {
        return {
            ok: false,
            reason: 'Unauthorized membership approval request.',
            status: 401,
        } as const
    }

    return { ok: true } as const
}

function validateApproveRequest(body: ApproveMembershipRegistrationRequest) {
    if (!body.requestId?.trim()) {
        return 'Request id is required.'
    }
    if (!body.epoch?.trim()) {
        return 'Epoch is required.'
    }
    if (body.ttlDays !== undefined && (!Number.isFinite(body.ttlDays) || body.ttlDays < 1 || body.ttlDays > 365)) {
        return 'TTL days must be between 1 and 365.'
    }
    return null
}

export async function POST(request: NextRequest) {
    const auth = isAuthorized(request)
    if (!auth.ok) {
        return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status })
    }

    const body = (await request.json()) as ApproveMembershipRegistrationRequest
    const validationError = validateApproveRequest(body)

    if (validationError) {
        return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
    }

    const registrationRequest = getMembershipRegistrationRequestById(body.requestId.trim())
    if (!registrationRequest) {
        return NextResponse.json({ ok: false, error: 'Registration request not found.' }, { status: 404 })
    }

    if (registrationRequest.status !== 'pending') {
        return NextResponse.json({ ok: false, error: 'Registration request already processed.' }, { status: 409 })
    }

    const issued = issueMembershipCredential({
        org: registrationRequest.org,
        epoch: body.epoch.trim(),
        walletAddress: registrationRequest.walletAddress,
        ttlDays: body.ttlDays,
    })

    if (!issued.ok) {
        return NextResponse.json({ ok: false, error: issued.reason }, { status: 422 })
    }

    const approved = markMembershipRegistrationApproved(registrationRequest.id)
    const profile = markUserProfileMembershipApproved({
        walletAddress: registrationRequest.walletAddress,
        org: registrationRequest.org,
    })
    const payload: IssueMembershipCredentialResponse = {
        credential: issued.credential,
        suggestedFileName: issued.suggestedFileName,
    }

    return NextResponse.json({ ok: true, approved, profile, ...payload })
}
