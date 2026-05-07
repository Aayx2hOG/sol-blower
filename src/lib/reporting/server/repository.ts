import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { Keypair } from '@solana/web3.js'

import type { MembershipRegistrationRequestRecord, OrgRecord, ReportAttestationRecord, UserProfileRecord, NullifierRecord, MerkleRootRecord } from '@/lib/reporting/types'

const reportStore = new Map<string, ReportAttestationRecord>()
const membershipRegistrationStore = new Map<string, MembershipRegistrationRequestRecord>()
const nullifierStore = new Map<string, NullifierRecord>() // Prevent double-submission
const merkleRootStore = new Map<string, MerkleRootRecord>() // Store trusted merkle roots per org
type InternalOrgRecord = OrgRecord & {
    adminSecretKeySeed: string
    adminPublicKey: string
}

const orgStore = new Map<string, InternalOrgRecord>()
const userProfileStore = new Map<string, UserProfileRecord>()
const persistenceFilePath = process.env.VERCEL
    ? resolve('/tmp', 'sol-zk-reporting-state.json')
    : resolve(process.cwd(), '.data', 'reporting-state.json')

type PersistedState = {
    reports: ReportAttestationRecord[]
    membershipRequests: MembershipRegistrationRequestRecord[]
    orgs: InternalOrgRecord[]
    userProfiles: UserProfileRecord[]
    nullifiers: NullifierRecord[]
    merkleRoots: MerkleRootRecord[]
}

let persistenceReady = false
let persistenceDisabled = false
let persistenceWarningShown = false

function loadPersistedState() {
    if (persistenceReady) {
        return
    }

    let needsPersist = false

    try {
        const raw = readFileSync(persistenceFilePath, 'utf8')
        const parsed = JSON.parse(raw) as PersistedState

        reportStore.clear()
        membershipRegistrationStore.clear()
        orgStore.clear()
        userProfileStore.clear()
        nullifierStore.clear()
        merkleRootStore.clear()

        for (const record of parsed.reports ?? []) {
            reportStore.set(record.txSignature, record)
        }
        for (const record of parsed.membershipRequests ?? []) {
            membershipRegistrationStore.set(record.id, record)
        }
        for (const record of parsed.orgs ?? []) {
            const secretSeed = (record as InternalOrgRecord).adminSecretKeySeed ?? createOrgSecretSeed()
            const hydrated: InternalOrgRecord = {
                ...record,
                adminSecretKeySeed: secretSeed,
                adminPublicKey: (record as InternalOrgRecord).adminPublicKey ?? seedToPublicKey(secretSeed),
            }
            if (!('adminSecretKeySeed' in record) || !('adminPublicKey' in record)) {
                needsPersist = true
            }
            orgStore.set(record.slug, hydrated)
        }
        for (const record of parsed.userProfiles ?? []) {
            userProfileStore.set(record.walletAddress, record)
        }
        for (const record of parsed.nullifiers ?? []) {
            nullifierStore.set(record.nullifier, record)
        }
        for (const record of parsed.merkleRoots ?? []) {
            merkleRootStore.set(`${record.org}:${record.root}`, record)
        }
    } catch {
        // Fresh install or unreadable state file. Start empty.
    } finally {
        persistenceReady = true
    }

    if (needsPersist) {
        persistState()
    }
}

function persistState() {
    if (persistenceDisabled) {
        return
    }

    try {
        mkdirSync(dirname(persistenceFilePath), { recursive: true })

        const snapshot: PersistedState = {
            reports: Array.from(reportStore.values()),
            membershipRequests: Array.from(membershipRegistrationStore.values()),
            orgs: Array.from(orgStore.values()),
            userProfiles: Array.from(userProfileStore.values()),
            nullifiers: Array.from(nullifierStore.values()),
            merkleRoots: Array.from(merkleRootStore.values()),
        }

        writeFileSync(persistenceFilePath, JSON.stringify(snapshot, null, 2), 'utf8')
    } catch (error) {
        persistenceDisabled = true

        if (!persistenceWarningShown) {
            persistenceWarningShown = true
            console.warn('Reporting state persistence disabled; continuing with in-memory state only.', error)
        }
    }
}

function ensureStateLoaded() {
    loadPersistedState()
}

function normalizeOrgSlug(input: string) {
    return input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function toPublicOrgRecord(org: InternalOrgRecord): OrgRecord {
    return {
        id: org.id,
        slug: org.slug,
        name: org.name,
        adminWalletAddress: org.adminWalletAddress,
        createdAt: org.createdAt,
    }
}

function createOrgSecretSeed() {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
}

function seedToPublicKey(seed: string) {
    const parsed = Buffer.from(seed, 'base64')
    const keyBytes = parsed.length === 64 ? parsed.subarray(0, 32) : parsed
    return Keypair.fromSeed(new Uint8Array(keyBytes)).publicKey.toBase58()
}

function findInternalOrg(orgIdentifier: string) {
    const normalizedIdentifier = normalizeOrgSlug(orgIdentifier)
    const exactMatch = orgStore.get(normalizedIdentifier)
    if (exactMatch) {
        return exactMatch
    }

    const byName = Array.from(orgStore.values()).find((org) => org.name === orgIdentifier)
    if (byName) {
        return byName
    }

    return Array.from(orgStore.values()).find((org) => normalizeOrgSlug(org.name) === normalizedIdentifier) ?? null
}

export function getOrgAdminSecretSeed(orgIdentifier: string) {
    ensureStateLoaded()

    const org = findInternalOrg(orgIdentifier)
    if (org) {
        return org.adminSecretKeySeed
    }

    return null
}

export function getOrgAdminPublicKey(orgIdentifier: string) {
    ensureStateLoaded()

    const org = findInternalOrg(orgIdentifier)
    if (org) {
        return org.adminPublicKey
    }

    const seed = getOrgAdminSecretSeed(orgIdentifier)
    if (!seed) {
        return null
    }

    try {
        return seedToPublicKey(seed)
    } catch {
        return null
    }
}

export function saveReportAttestation(record: Omit<ReportAttestationRecord, 'id' | 'createdAt'>): ReportAttestationRecord {
    ensureStateLoaded()

    const savedRecord: ReportAttestationRecord = {
        ...record,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }

    reportStore.set(savedRecord.txSignature, savedRecord)
    persistState()
    return savedRecord
}

export function getReportAttestationBySignature(signature: string) {
    ensureStateLoaded()

    return reportStore.get(signature) ?? null
}

export function getReportAttestationById(id: string) {
    ensureStateLoaded()

    return Array.from(reportStore.values()).find((record) => record.id === id) ?? null
}

export function listReportAttestations({ org }: { org: string }) {
    ensureStateLoaded()

    return Array.from(reportStore.values())
        .filter((record) => record.org === org)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function createMembershipRegistrationRequest({ org, walletAddress }: { org: string; walletAddress: string }): MembershipRegistrationRequestRecord {
    ensureStateLoaded()

    const existingPending = Array.from(membershipRegistrationStore.values()).find(
        (request) => request.org === org && request.walletAddress === walletAddress && request.status === 'pending',
    )

    if (existingPending) {
        return existingPending
    }

    const created: MembershipRegistrationRequestRecord = {
        id: crypto.randomUUID(),
        org,
        walletAddress,
        status: 'pending',
        createdAt: new Date().toISOString(),
    }

    membershipRegistrationStore.set(created.id, created)
    persistState()
    return created
}

export function listMembershipRegistrationRequests() {
    ensureStateLoaded()

    return Array.from(membershipRegistrationStore.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getMembershipRegistrationRequestById(id: string) {
    ensureStateLoaded()

    return membershipRegistrationStore.get(id) ?? null
}

export function markMembershipRegistrationApproved(id: string) {
    ensureStateLoaded()

    const request = membershipRegistrationStore.get(id)
    if (!request) {
        return null
    }

    const approved: MembershipRegistrationRequestRecord = {
        ...request,
        status: 'approved',
        approvedAt: new Date().toISOString(),
    }

    membershipRegistrationStore.set(id, approved)
    persistState()
    return approved
}

export function createOrg({ name, adminWalletAddress }: { name: string; adminWalletAddress: string }) {
    ensureStateLoaded()

    const normalizedName = name.trim()
    const slug = normalizeOrgSlug(normalizedName)
    if (!slug) {
        return null
    }

    const existingBySlug = orgStore.get(slug)
    if (existingBySlug) {
        return toPublicOrgRecord(existingBySlug)
    }

    const adminSecretKeySeed = createOrgSecretSeed()
    const adminPublicKey = seedToPublicKey(adminSecretKeySeed)

    const created: InternalOrgRecord = {
        id: crypto.randomUUID(),
        slug,
        name: normalizedName,
        adminWalletAddress,
        createdAt: new Date().toISOString(),
        adminSecretKeySeed,
        adminPublicKey,
    }

    orgStore.set(slug, created)
    persistState()
    return toPublicOrgRecord(created)
}

export function listOrgs() {
    ensureStateLoaded()

    return Array.from(orgStore.values())
        .map(toPublicOrgRecord)
        .sort((a, b) => a.name.localeCompare(b.name))
}

export function getOrgBySlug(slug: string) {
    ensureStateLoaded()

    const org = orgStore.get(normalizeOrgSlug(slug)) ?? null
    return org ? toPublicOrgRecord(org) : null
}

export function getUserProfile(walletAddress: string) {
    ensureStateLoaded()

    return userProfileStore.get(walletAddress) ?? null
}

export function upsertUserProfile({
    walletAddress,
    role,
    org,
    membershipStatus,
}: {
    walletAddress: string
    role: UserProfileRecord['role']
    org: string
    membershipStatus: UserProfileRecord['membershipStatus']
}) {
    ensureStateLoaded()

    const existing = userProfileStore.get(walletAddress)
    const now = new Date().toISOString()

    const profile: UserProfileRecord = {
        walletAddress,
        role,
        org,
        membershipStatus,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
    }

    userProfileStore.set(walletAddress, profile)
    persistState()
    return profile
}

export function markUserProfileMembershipApproved({ walletAddress, org }: { walletAddress: string; org: string }) {
    ensureStateLoaded()

    const existing = userProfileStore.get(walletAddress)
    if (!existing || existing.org !== org) {
        return null
    }

    return upsertUserProfile({
        walletAddress,
        role: existing.role,
        org,
        membershipStatus: 'approved',
    })
}

// NULLIFIER TRACKING: Prevent double-submission of same proof
export function checkNullifierUsed(nullifier: string, org: string): boolean {
    ensureStateLoaded()

    const record = nullifierStore.get(nullifier)
    if (!record) {
        return false
    }

    // Nullifier can only be used once per org
    return record.org === org
}

export function recordNullifierUsage(nullifier: string, org: string, reportId: string): NullifierRecord {
    ensureStateLoaded()

    if (checkNullifierUsed(nullifier, org)) {
        throw new Error(`Nullifier already used in organization ${org}`)
    }

    const record: NullifierRecord = {
        nullifier,
        org,
        reportId,
        createdAt: new Date().toISOString(),
    }

    nullifierStore.set(nullifier, record)
    persistState()
    return record
}

// MERKLE ROOT MANAGEMENT: Store trusted merkle roots for proof verification
export function addMerkleRoot(org: string, root: string, epoch: string): MerkleRootRecord {
    ensureStateLoaded()

    const key = `${org}:${root}`
    if (merkleRootStore.has(key)) {
        // Root already exists, return existing record
        return merkleRootStore.get(key)!
    }

    const record: MerkleRootRecord = {
        root,
        org,
        addedAt: new Date().toISOString(),
        epoch,
    }

    merkleRootStore.set(key, record)
    persistState()
    return record
}

export function isMerkleRootTrusted(org: string, root: string): boolean {
    ensureStateLoaded()

    const key = `${org}:${root}`
    return merkleRootStore.has(key)
}

export function listMerkleRoots(org: string): MerkleRootRecord[] {
    ensureStateLoaded()

    return Array.from(merkleRootStore.values())
        .filter((r) => r.org === org)
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

export function removeMerkleRoot(org: string, root: string): boolean {
    ensureStateLoaded()

    const key = `${org}:${root}`
    if (merkleRootStore.has(key)) {
        merkleRootStore.delete(key)
        persistState()
        return true
    }

    return false
}
