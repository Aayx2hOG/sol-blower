import { NextRequest, NextResponse } from 'next/server'

import { issueMembershipCredential } from '@/lib/reporting/server/membership'
import { authorizeMembershipAdminRequest } from '@/lib/reporting/server/admin-auth'
import { jsonUnexpectedError, parseJsonBody } from '@/lib/reporting/server/http'
import type { IssueMembershipCredentialRequest, IssueMembershipCredentialResponse } from '@/lib/reporting/types'

export const runtime = 'nodejs'

function validateIssueRequest(body: IssueMembershipCredentialRequest) {
    if (!body.org?.trim()) {
        return 'Organization is required.'
    }
    if (!body.epoch?.trim()) {
        return 'Membership epoch is required.'
    }
    if (!body.walletAddress?.trim()) {
        return 'Wallet address is required.'
    }
    if (body.ttlDays !== undefined && (!Number.isFinite(body.ttlDays) || body.ttlDays < 1 || body.ttlDays > 365)) {
        return 'TTL days must be between 1 and 365.'
    }
    return null
}

export async function POST(request: NextRequest) {
    try {
        const parsedBody = await parseJsonBody<IssueMembershipCredentialRequest>(request)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const body = parsedBody.data
        const validationError = validateIssueRequest(body)
        if (validationError) {
            return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
        }

        const org = body.org.trim()
        const auth = authorizeMembershipAdminRequest({
            request,
            org,
            action: 'issue-membership',
        })
        if (!auth.ok) {
            return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status })
        }

        const issued = issueMembershipCredential({
            org,
            epoch: body.epoch.trim(),
            walletAddress: body.walletAddress.trim(),
            ttlDays: body.ttlDays,
        })

        if (!issued.ok) {
            return NextResponse.json({ ok: false, error: issued.reason }, { status: 422 })
        }

        const payload: IssueMembershipCredentialResponse = {
            credential: issued.credential,
            suggestedFileName: issued.suggestedFileName,
        }

        return NextResponse.json({ ok: true, ...payload })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to issue membership credential.')
    }
}