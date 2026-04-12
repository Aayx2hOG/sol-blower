import { NextRequest, NextResponse } from 'next/server'

import { authorizeMembershipAdminRequest } from '@/lib/reporting/server/admin-auth'
import { jsonUnexpectedError } from '@/lib/reporting/server/http'
import { listReportAttestations } from '@/lib/reporting/server/repository'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
    try {
        const org = request.nextUrl.searchParams.get('org')?.trim() ?? ''
        if (!org) {
            return NextResponse.json({ ok: false, error: 'org query parameter is required.' }, { status: 400 })
        }

        const auth = authorizeMembershipAdminRequest({
            request,
            org,
            action: 'list-reports',
        })
        if (!auth.ok) {
            return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status })
        }

        const records = listReportAttestations({ org }).map(({ ciphertextBase64, encryptionKeyBase64, ...safeRecord }) => safeRecord)
        return NextResponse.json({ ok: true, records })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to load report attestations.')
    }
}