import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js'

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

const rpcEndpoint = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet')
const serverConnection = new Connection(rpcEndpoint, 'confirmed')

function readMemoText(instruction: unknown): string | null {
    if (!instruction || typeof instruction !== 'object') {
        return null
    }

    const programIdRaw = (instruction as { programId?: PublicKey | string }).programId
    const programId =
        typeof programIdRaw === 'string'
            ? programIdRaw
            : programIdRaw && typeof (programIdRaw as PublicKey).toBase58 === 'function'
                ? (programIdRaw as PublicKey).toBase58()
                : null

    if (programId !== MEMO_PROGRAM_ID) {
        return null
    }

    const parsed = (instruction as { parsed?: unknown }).parsed
    if (typeof parsed === 'string') {
        return parsed
    }

    if (parsed && typeof parsed === 'object') {
        const info = (parsed as { info?: unknown }).info
        if (typeof info === 'string') {
            return info
        }
    }

    return null
}

export async function verifyMemoAttestation({
    signature,
    walletAddress,
    proofCommitment,
    encryptedPayloadHash,
    org,
    epoch,
}: {
    signature: string
    walletAddress: string
    proofCommitment: string
    encryptedPayloadHash: string
    org: string
    epoch: string
}) {
    const tx = await serverConnection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
    })

    if (!tx) {
        return {
            ok: false,
            reason: 'Transaction not found on selected cluster.',
        } as const
    }

    const accountKeys = tx.transaction.message.accountKeys.map((key) => key.pubkey.toBase58())
    const walletSeenInTx = accountKeys.includes(walletAddress)

    const memoCandidates = tx.transaction.message.instructions
        .map((ix) => readMemoText(ix))
        .filter((memo): memo is string => Boolean(memo))

    const matchedMemo = memoCandidates.find(
        (memo) =>
            memo.includes(proofCommitment) &&
            memo.includes(encryptedPayloadHash) &&
            memo.includes(`"org":"${org}"`) &&
            memo.includes(`"epoch":"${epoch}"`),
    )

    if (!walletSeenInTx) {
        return {
            ok: false,
            reason: 'Wallet address not present in transaction account keys.',
        } as const
    }

    if (!matchedMemo) {
        return {
            ok: false,
            reason: 'Memo payload mismatch for supplied report metadata.',
        } as const
    }

    return {
        ok: true,
        memoMatched: true,
    } as const
}
