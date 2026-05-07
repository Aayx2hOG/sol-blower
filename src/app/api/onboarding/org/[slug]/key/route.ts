import { NextRequest, NextResponse } from 'next/server'

import { getOrgAdminPublicKey, getOrgBySlug } from '@/lib/reporting/server/repository'
import { jsonUnexpectedError } from '@/lib/reporting/server/http'
import type { OrgPublicKeyResponse } from '@/lib/reporting/types'

export const runtime = 'nodejs'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params

        if (!slug || typeof slug !== 'string') {
            return NextResponse.json({ ok: false, error: 'Organization slug is required.' }, { status: 400 })
        }

        const org = getOrgBySlug(slug)
        if (!org) {
            return NextResponse.json({ ok: false, error: 'Organization not found.' }, { status: 404 })
        }

        const adminPublicKeyBase64 = getOrgAdminPublicKey(slug)
        if (!adminPublicKeyBase64) {
            return NextResponse.json(
                { ok: false, error: 'Admin public key is not configured for this organization.' },
                { status: 500 }
            )
        }

        // Compute a hash of the verification key (for client-side validation)
        // This helps clients detect key changes/rotation
        const keyHash = await crypto.subtle
            .digest('SHA-256', Buffer.from(adminPublicKeyBase64, 'base64'))
            .then((buf) => Buffer.from(buf).toString('hex').slice(0, 16))

        const response: OrgPublicKeyResponse = {
            org: org.slug,
            adminPublicKeyBase64,
            verificationKeyHash: keyHash,
        }

        return NextResponse.json({ ok: true, ...response })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to fetch organization public key.')
    }
}
