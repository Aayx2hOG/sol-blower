import type { WalletChallenge } from '@/lib/reporting/types'

function bytesToBase64(bytes: Uint8Array) {
    let binary = ''
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte)
    })
    return btoa(binary)
}

export function createWalletChallengeMessage({
    walletAddress,
    txSignature,
    proofCommitment,
    encryptedPayloadHash,
    org,
    epoch,
    challenge,
}: {
    walletAddress: string
    txSignature: string
    proofCommitment: string
    encryptedPayloadHash: string
    org: string
    epoch: string
    challenge: WalletChallenge
}) {
    return [
        'sol-zk-attest-v1',
        walletAddress,
        txSignature,
        proofCommitment,
        encryptedPayloadHash,
        org,
        epoch,
        challenge.nonce,
        challenge.issuedAt,
    ].join('|')
}

export function encodeSignatureBase64(signature: Uint8Array) {
    return bytesToBase64(signature)
}