import { secretbox, box, randomBytes, BoxKeyPair } from 'tweetnacl'
import type { EncryptionResult, ProofResult, ReportDraft, WrappedEncryptionKey } from '@/lib/reporting/types'

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

// Convert base64 to Uint8Array (tweetnacl format)
function base64ToBytes(base64: string): Uint8Array {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes
}

// Envelope encrypt AES key with admin's X25519 public key
// Uses NaCl secretbox (XSalsa20-Poly1305) with ephemeral key pair
export async function wrapAESKeyForAdmin({
    aesKeyBase64,
    adminPublicKeyBase64,
}: {
    aesKeyBase64: string
    adminPublicKeyBase64: string
}): Promise<WrappedEncryptionKey> {
    try {
        const aesKey = base64ToBytes(aesKeyBase64)
        const adminPublicKey = base64ToBytes(adminPublicKeyBase64)

        if (adminPublicKey.length !== 32) {
            throw new Error('Invalid admin public key length (expected 32 bytes for X25519)')
        }

        // Generate ephemeral key pair for this encryption
        const ephemeralKeyPair: BoxKeyPair = box.keyPair()

        // Encrypt AES key using NaCl box (X25519 + XSalsa20-Poly1305)
        const nonce = randomBytes(24)
        const wrappedKeyBytes = box(aesKey, nonce, adminPublicKey, ephemeralKeyPair.secretKey)

        // Combine nonce + ciphertext (nonce is prepended for decryption)
        const wrappedFull = new Uint8Array(nonce.length + wrappedKeyBytes.length)
        wrappedFull.set(nonce, 0)
        wrappedFull.set(wrappedKeyBytes, nonce.length)

        return {
            wrappedKeyBase64: bytesToBase64(wrappedFull),
            ephemeralPublicKeyBase64: bytesToBase64(ephemeralKeyPair.publicKey),
        }
    } catch (error) {
        throw new Error(`Failed to wrap AES key for admin: ${error instanceof Error ? error.message : String(error)}`)
    }
}

// Unwrap AES key using admin's private key (server-side or client-side)
export async function unwrapAESKey({
    wrappedKeyBase64,
    ephemeralPublicKeyBase64,
    adminPrivateKeyBase64,
}: {
    wrappedKeyBase64: string
    ephemeralPublicKeyBase64: string
    adminPrivateKeyBase64: string
}): Promise<string> {
    try {
        const wrappedFull = base64ToBytes(wrappedKeyBase64)
        const ephemeralPublicKey = base64ToBytes(ephemeralPublicKeyBase64)
        const adminPrivateKey = base64ToBytes(adminPrivateKeyBase64)

        if (ephemeralPublicKey.length !== 32) {
            throw new Error('Invalid ephemeral public key length')
        }

        if (adminPrivateKey.length !== 32) {
            throw new Error('Invalid admin private key length (expected 32 bytes)')
        }

        if (wrappedFull.length < 24) {
            throw new Error('Invalid wrapped key format (too short)')
        }

        // Extract nonce and ciphertext
        const nonce = wrappedFull.slice(0, 24)
        const ciphertext = wrappedFull.slice(24)

        // Decrypt using NaCl box.open
        const aesKeyBytes = box.open(ciphertext, nonce, ephemeralPublicKey, adminPrivateKey)

        if (!aesKeyBytes) {
            throw new Error('Failed to decrypt AES key (box.open returned null)')
        }

        return bytesToBase64(aesKeyBytes)
    } catch (error) {
        throw new Error(`Failed to unwrap AES key: ${error instanceof Error ? error.message : String(error)}`)
    }
}
