export interface ReportDraft {
    org: string
    epoch: string
    title: string
    details: string
}

export interface ProofResult {
    commitment: string
    nonceHex: string
}

export interface EncryptionResult {
    ciphertextBase64: string
    payloadHash: string
    ivBase64: string
    keyBase64: string
}

// ZK Proof generation result (Groth16)
export interface ZKProofResult {
    pi_a: [string, string] // proof.pi_a in hex
    pi_b: [[string, string], [string, string]] // proof.pi_b in hex
    pi_c: [string, string] // proof.pi_c in hex
    protocol: string // "groth16"
    curve: string // "bn128"
    publicSignals: string[] // [root, nullifier, externalNullifier]
}

// Wrapped AES key (encrypted with admin public key via X25519)
export interface WrappedEncryptionKey {
    wrappedKeyBase64: string // Ciphertext of AES key (encrypted by ephemeral key pair + X25519)
    ephemeralPublicKeyBase64: string // Ephemeral public key used for encryption
}

export interface SubmitReportMemoInput {
    draft: ReportDraft
    proofCommitment: string
    encryptedPayloadHash: string
    ivBase64: string
}

export interface AttestReportRequest {
    draft: ReportDraft
    walletAddress: string
    txSignature: string
    proofCommitment: string
    encryptedPayloadHash: string
    ivBase64: string
    ciphertextBase64: string
    wrappedEncryptionKey: WrappedEncryptionKey // Wrapped AES key (never plaintext)
    zkProof: ZKProofResult // Full ZK proof from snarkjs
    membershipCredential: MembershipCredential
    walletChallenge: WalletChallenge
    walletSignatureBase64: string
}

export interface MembershipCredentialPayload {
    version: number
    credentialId: string
    org: string
    epoch: string
    walletAddress: string
    issuedAt: string
    expiresAt: string
}

export interface MembershipCredential {
    payload: MembershipCredentialPayload
    issuerPublicKey: string
    adminSignatureBase64: string
}

export interface WalletChallenge {
    nonce: string
    issuedAt: string
}

export interface IssueMembershipCredentialRequest {
    org: string
    epoch: string
    walletAddress: string
    ttlDays?: number
}

export interface IssueMembershipCredentialResponse {
    credential: MembershipCredential
    suggestedFileName: string
}

export interface CreateMembershipRegistrationRequest {
    org: string
    walletAddress: string
}



export interface MembershipRegistrationRequestRecord {
    id: string
    org: string
    walletAddress: string
    status: 'pending' | 'approved'
    createdAt: string
    approvedAt?: string
}

// Zero-K compatible Merkle root record
export interface MerkleRootRecord {
    root: string
    org: string
    addedAt: string
    epoch: string
}

export interface ApproveMembershipRegistrationRequest {
    requestId: string
    epoch: string
    ttlDays?: number
}

// Admin action to manage merkle roots (for Zero-K parity)
export interface AddMerkleRootRequest {
    org: string
    root: string
    epoch: string
}

export interface ListMerkleRootsResponse {
    roots: MerkleRootRecord[]
}

export interface OrgRecord {
    id: string
    slug: string
    name: string
    adminWalletAddress: string
    createdAt: string
}

export interface OrgPublicKeyResponse {
    org: string
    adminPublicKeyBase64: string // X25519 public key for envelope encryption
    verificationKeyHash: string // Hash of verification key (for proof verification)
}

export interface UserProfileRecord {
    walletAddress: string
    role: 'admin' | 'reporter'
    org: string
    membershipStatus: 'pending' | 'approved'
    createdAt: string
    updatedAt: string
}

// Server-side nullifier tracking for ZK proofs
export interface NullifierRecord {
    nullifier: string
    org: string
    reportId: string
    createdAt: string
}

export interface ReportAttestationRecord {
    id: string
    txSignature: string
    walletAddress: string
    org: string
    epoch: string
    proofCommitment: string
    encryptedPayloadHash: string
    ivBase64: string
    ciphertextBase64?: string
    wrappedEncryptionKey?: WrappedEncryptionKey // Wrapped AES key (safe for storage)
    zkProofNullifier?: string // Nullifier from ZK proof (prevent double-submission)
    memoMatched: boolean
    zkProofVerified: boolean // Whether ZK proof was verified on server
    membershipCredentialId: string
    walletChallengeNonce: string
    membershipVerified: boolean
    createdAt: string
}

export interface DecryptedReportPayload {
    title: string
    details: string
    org: string
    epoch: string
}

// Admin unwrap request: server decrypts wrapped key with admin private key
export interface AdminUnwrapKeyRequest {
    reportId: string
    adminPrivateKeyBase64?: string // Optional: if admin has privkey in KMS, server unwraps; otherwise client does
}

export interface AdminUnwrapKeyResponse {
    unwrappedKeyBase64: string // Raw AES key for client-side decryption
}
