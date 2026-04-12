import { createDecipheriv } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { authorizeMembershipAdminRequest } from '@/lib/reporting/server/admin-auth'
import { jsonUnexpectedError } from '@/lib/reporting/server/http'
import { getReportAttestationById } from '@/lib/reporting/server/repository'
import type { DecryptedReportPayload } from '@/lib/reporting/types'

export const runtime = 'nodejs'

function decryptPayload({
    ciphertextBase64,
    ivBase64,
    keyBase64,
}: {
    ciphertextBase64: string
    ivBase64: string
    keyBase64: string
}) {
    const key = Buffer.from(keyBase64, 'base64')
    const iv = Buffer.from(ivBase64, 'base64')
    const cipherCombined = Buffer.from(ciphertextBase64, 'base64')

    if (key.length !== 32) {
        throw new Error('Invalid stored AES key length.')
    }
    if (iv.length !== 12) {
        throw new Error('Invalid stored IV length.')
    }
    if (cipherCombined.length <= 16) {
        throw new Error('Invalid stored ciphertext length.')
    }

    const authTag = cipherCombined.subarray(cipherCombined.length - 16)
    const encrypted = cipherCombined.subarray(0, cipherCombined.length - 16)

    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    return decrypted
}

export async function GET(request: NextRequest) {
    try {
        const id = request.nextUrl.searchParams.get('id')?.trim() ?? ''
        if (!id) {
            return NextResponse.json({ ok: false, error: 'id query parameter is required.' }, { status: 400 })
        }

        const record = getReportAttestationById(id)
        if (!record) {
            return NextResponse.json({ ok: false, error: 'Report attestation not found.' }, { status: 404 })
        }

        const auth = authorizeMembershipAdminRequest({
            request,
            org: record.org,
            action: 'decrypt-report',
        })
        if (!auth.ok) {
            return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.status })
        }

        if (!record.ciphertextBase64 || !record.encryptionKeyBase64) {
            return NextResponse.json({ ok: false, error: 'Decryption material is not available for this report.' }, { status: 422 })
        }

        const decryptedText = decryptPayload({
            ciphertextBase64: record.ciphertextBase64,
            ivBase64: record.ivBase64,
            keyBase64: record.encryptionKeyBase64,
        })

        const parsed = JSON.parse(decryptedText) as Partial<DecryptedReportPayload>
        if (typeof parsed.title !== 'string' || typeof parsed.details !== 'string') {
            return NextResponse.json({ ok: false, error: 'Decrypted payload format is invalid.' }, { status: 422 })
        }

        const payload: DecryptedReportPayload = {
            title: parsed.title,
            details: parsed.details,
            org: typeof parsed.org === 'string' ? parsed.org : record.org,
            epoch: typeof parsed.epoch === 'string' ? parsed.epoch : record.epoch,
        }

        return NextResponse.json({ ok: true, payload })
    } catch (error) {
        return jsonUnexpectedError(error, 'Failed to decrypt report payload.')
    }
}