import { NextRequest, NextResponse } from 'next/server'

import { createMembershipRegistrationRequest, getOrgBySlug, upsertUserProfile } from '@/lib/reporting/server/repository'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
    const body = (await request.json()) as { walletAddress?: string; orgSlug?: string }

    const walletAddress = body.walletAddress?.trim() ?? ''
    const orgSlug = body.orgSlug?.trim() ?? ''

    if (!walletAddress) {
        return NextResponse.json({ ok: false, error: 'walletAddress is required.' }, { status: 400 })
    }

    if (!orgSlug) {
        return NextResponse.json({ ok: false, error: 'orgSlug is required.' }, { status: 400 })
    }

    const org = getOrgBySlug(orgSlug)
    if (!org) {
        return NextResponse.json({ ok: false, error: 'Selected organization does not exist.' }, { status: 404 })
    }

    const registrationRequest = createMembershipRegistrationRequest({
        org: org.slug,
        walletAddress,
    })

    const profile = upsertUserProfile({
        walletAddress,
        role: 'reporter',
        org: org.slug,
        membershipStatus: registrationRequest.status === 'approved' ? 'approved' : 'pending',
    })

    return NextResponse.json({ ok: true, registrationRequest, profile, org })
}
