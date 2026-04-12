import { NextRequest, NextResponse } from 'next/server'

import { createMembershipRegistrationRequest, listMembershipRegistrationRequests } from '@/lib/reporting/server/repository'
import { jsonUnexpectedError, parseJsonBody } from '@/lib/reporting/server/http'
import type { CreateMembershipRegistrationRequest } from '@/lib/reporting/types'

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
            reason: 'Unauthorized membership admin request.',
            status: 401,
        } as const
    }

    return { ok: true } as const
}

function validateCreateRequest(body: CreateMembershipRegistrationRequest) {
    if (!body.org?.trim()) {
        return 'Organization is required.'
    }
    if (!body.walletAddress?.trim()) {
        return 'Wallet address is required.'
    }
    return null
}

export async function POST(request: NextRequest) {
    try {
        const parsedBody = await parseJsonBody<CreateMembershipRegistrationRequest>(request)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const body = parsedBody.data
        const validationError = validateCreateRequest(body)

        if (validationError) {
            return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
        }

        const record = createMembershipRegistrationRequest({
            org: body.org.trim(),
            walletAddress: body.walletAddress.trim(),
        })

        return NextResponse.json({ ok: true, record })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to create registration request.')
    }
}

export async function GET(request: NextRequest) {
    try {
        const auth = isAuthorized(request)
        if (!auth.ok) {
            return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status })
        }

        const records = listMembershipRegistrationRequests()
        return NextResponse.json({ ok: true, records })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to load registration requests.')
    }
}
