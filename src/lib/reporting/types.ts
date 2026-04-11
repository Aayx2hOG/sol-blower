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

export interface ApproveMembershipRegistrationRequest {
    requestId: string
    epoch: string
    ttlDays?: number
}

export interface OrgRecord {
    id: string
    slug: string
    name: string
    adminWalletAddress: string
    createdAt: string
}

export interface UserProfileRecord {
    walletAddress: string
    role: 'admin' | 'reporter'
    org: string
    membershipStatus: 'pending' | 'approved'
    createdAt: string
    updatedAt: string
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
    memoMatched: boolean
    membershipCredentialId: string
    walletChallengeNonce: string
    membershipVerified: boolean
    createdAt: string
}
