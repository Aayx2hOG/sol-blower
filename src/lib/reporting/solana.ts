import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'

import type { SubmitReportMemoInput } from '@/lib/reporting/types'

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export async function submitReportMemo({
    connection,
    walletPublicKey,
    sendTransaction,
    input,
}: {
    connection: Connection
    walletPublicKey: PublicKey
    sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>
    input: SubmitReportMemoInput
}) {
    const memoPayload = JSON.stringify({
        app: 'solzk-report',
        version: 1,
        org: input.draft.org.trim(),
        epoch: input.draft.epoch.trim(),
        proofCommitment: input.proofCommitment,
        encryptedPayloadHash: input.encryptedPayloadHash,
        iv: input.ivBase64,
        createdAt: new Date().toISOString(),
    })

    const tx = new Transaction().add(
        new TransactionInstruction({
            keys: [],
            programId: MEMO_PROGRAM_ID,
            data: Buffer.from(memoPayload, 'utf8'),
        }),
    )

    const { blockhash } = await connection.getLatestBlockhash('confirmed')
    tx.feePayer = walletPublicKey
    tx.recentBlockhash = blockhash

    const signature = await sendTransaction(tx, connection)
    await connection.confirmTransaction(signature, 'confirmed')

    return signature
}
