import type { EncryptionResult, ProofResult, ReportDraft } from '@/lib/reporting/types'

function bytesToHex(bytes: Uint8Array) {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
}

function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
    })
    return btoa(binary)
}

async function sha256Hex(input: string) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return bytesToHex(new Uint8Array(digest))
}

export async function generateProofCommitment({ draft, walletAddress }: { draft: ReportDraft; walletAddress: string }): Promise<ProofResult> {
    const nonceBytes = crypto.getRandomValues(new Uint8Array(12))
    const nonceHex = bytesToHex(nonceBytes)

    const proofMaterial = [
        walletAddress,
        draft.org.trim(),
        draft.epoch.trim(),
        draft.title.trim(),
        draft.details.trim(),
        nonceHex,
        Date.now().toString(),
    ].join('|')

    const commitment = await sha256Hex(proofMaterial)
    return {
        commitment,
        nonceHex,
    }
}

export async function encryptReportPayload({ draft, proofCommitment }: { draft: ReportDraft; proofCommitment: string }): Promise<EncryptionResult> {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32))
    const ivBytes = crypto.getRandomValues(new Uint8Array(12))
    const aesKey = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt'])

    const payload = JSON.stringify({
        title: draft.title.trim(),
        details: draft.details.trim(),
        org: draft.org.trim(),
        epoch: draft.epoch.trim(),
        commitment: proofCommitment,
    })

    const encryptedBytes = new Uint8Array(
        await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: ivBytes,
            },
            aesKey,
            new TextEncoder().encode(payload),
        ),
    )

    const ciphertextBase64 = bytesToBase64(encryptedBytes)
    const payloadHash = await sha256Hex(ciphertextBase64)

    return {
        ciphertextBase64,
        payloadHash,
        ivBase64: bytesToBase64(ivBytes),
        keyBase64: bytesToBase64(keyBytes),
    }
}
