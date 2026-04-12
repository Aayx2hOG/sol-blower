import { NextRequest, NextResponse } from 'next/server'

import { createOrg, upsertUserProfile } from '@/lib/reporting/server/repository'
import { jsonUnexpectedError, parseJsonBody } from '@/lib/reporting/server/http'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
    try {
        const parsedBody = await parseJsonBody<{ walletAddress?: string; orgName?: string }>(request)
        if (!parsedBody.ok) {
            return parsedBody.response
        }

        const body = parsedBody.data

        const walletAddress = body.walletAddress?.trim() ?? ''
        const orgName = body.orgName?.trim() ?? ''

        if (!walletAddress) {
            return NextResponse.json({ ok: false, error: 'walletAddress is required.' }, { status: 400 })
        }

        if (!orgName) {
            return NextResponse.json({ ok: false, error: 'orgName is required.' }, { status: 400 })
        }

        const org = createOrg({
            name: orgName,
            adminWalletAddress: walletAddress,
        })

        if (!org) {
            return NextResponse.json({ ok: false, error: 'Organization name is invalid.' }, { status: 400 })
        }

        const profile = upsertUserProfile({
            walletAddress,
            role: 'admin',
            org: org.slug,
            membershipStatus: 'approved',
        })

        return NextResponse.json({ ok: true, org, profile })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to create organization.')
    }
}
