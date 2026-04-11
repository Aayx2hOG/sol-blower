import { NextRequest, NextResponse } from 'next/server'

import { getUserProfile, listOrgs, listMembershipRegistrationRequests } from '@/lib/reporting/server/repository'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
    const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim()
    if (!walletAddress) {
        return NextResponse.json({ ok: false, error: 'walletAddress query parameter is required.' }, { status: 400 })
    }

    const profile = getUserProfile(walletAddress)
    const orgs = listOrgs()
    const myRequests = listMembershipRegistrationRequests().filter((request) => request.walletAddress === walletAddress)

    return NextResponse.json({
        ok: true,
        profile,
        orgs,
        myRequests,
    })
}
