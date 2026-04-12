export type MembershipAdminAction = 'list-requests' | 'approve-request' | 'issue-membership' | 'list-reports' | 'decrypt-report'

export function createAdminAuthMessage({
    walletAddress,
    org,
    issuedAt,
    nonce,
    action,
}: {
    walletAddress: string
    org: string
    issuedAt: string
    nonce: string
    action: MembershipAdminAction
}) {
    return ['sol-zk-admin-v1', walletAddress, org, action, nonce, issuedAt].join('|')
}