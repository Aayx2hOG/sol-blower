/**
 * Client-side Groth16 proof generation using snarkjs
 * Generates ZK proofs for Zero-K membership circuit
 *
 * Public signals: [merkleRoot, nullifier, externalNullifier]
 */

import { groth16 } from 'snarkjs'
import type { ZKProofResult } from '@/lib/reporting/types'

// WASM artifacts should be served from public folder or imported
// Path: /circuits/membership_js/ (from Zero-K circuits-artifacts)
const CIRCUITS_PATH = '/circuits/membership_js'

interface ProofInputs {
    // Private inputs (not revealed in proof)
    secretBytes: string // Secret hash
    merkleProof: string[] // Merkle tree path
    merklePathIndices: number[] // Bit flags for tree traversal
    leafIndex: number // Position in tree

    // Public inputs (revealed in proof)
    merkleRoot: string // Root of merkle tree (must match trusted root)
    externalNullifier: string // External nullifier (org/epoch specific)
}

/**
 * Generate a Groth16 proof for membership
 * Returns proof ready to submit to backend for verification
 */
export async function generateMembershipProof(inputs: ProofInputs): Promise<ZKProofResult> {
    try {
        // Load WASM witness calculator
        const wasmPath = `${CIRCUITS_PATH}/membership_js.wasm`
        const response = await fetch(wasmPath)
        if (!response.ok) {
            throw new Error(`Failed to load WASM: ${response.statusText}`)
        }
        const wasmBuffer = await response.arrayBuffer()

        // Load zkey (proving key)
        const zkeyPath = '/circuits/membership_final.zkey'
        const zkeyResponse = await fetch(zkeyPath)
        if (!zkeyResponse.ok) {
            throw new Error(`Failed to load zkey: ${zkeyResponse.statusText}`)
        }
        const zkeyBuffer = await zkeyResponse.arrayBuffer()

        // Prepare inputs for prover (convert to BigInt strings for snarkjs)
        const proofInputs = {
            secret: inputs.secretBytes,
            merkle_proof: inputs.merkleProof,
            merkle_path_indices: inputs.merklePathIndices,
            leaf_index: inputs.leafIndex.toString(),
            merkle_root: inputs.merkleRoot,
            external_nullifier: inputs.externalNullifier,
        }

        // Generate witness
        const witness = await groth16.fullProve(proofInputs, wasmBuffer, zkeyBuffer)

        // Proof is in witness.proof and witness.publicSignals
        const proof = witness.proof
        const publicSignals = witness.publicSignals

        // Convert to hex format expected by backend
        const pi_a_hex = [
            '0x' + proof.pi_a[0].toString(16),
            '0x' + proof.pi_a[1].toString(16),
        ] as [string, string]

        const pi_b_hex = [
            [
                '0x' + proof.pi_b[0][1].toString(16),
                '0x' + proof.pi_b[0][0].toString(16),
            ],
            [
                '0x' + proof.pi_b[1][1].toString(16),
                '0x' + proof.pi_b[1][0].toString(16),
            ],
        ] as [[string, string], [string, string]]

        const pi_c_hex = [
            '0x' + proof.pi_c[0].toString(16),
            '0x' + proof.pi_c[1].toString(16),
        ] as [string, string]

        // Public signals: [merkleRoot, nullifier, externalNullifier]
        const publicSignalsHex = publicSignals.map((sig: bigint) => '0x' + sig.toString(16))

        const result: ZKProofResult = {
            pi_a: pi_a_hex,
            pi_b: pi_b_hex,
            pi_c: pi_c_hex,
            protocol: 'groth16',
            curve: 'bn128',
            publicSignals: publicSignalsHex,
        }

        return result
    } catch (error) {
        throw new Error(`Proof generation failed: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * Helper: Extract nullifier from public signals
 */
export function getNullifierFromProof(proof: ZKProofResult): string {
    if (proof.publicSignals.length < 2) {
        throw new Error('Invalid proof: missing nullifier signal')
    }
    return proof.publicSignals[1]
}

/**
 * Helper: Extract merkle root from public signals
 */
export function getMerkleRootFromProof(proof: ZKProofResult): string {
    if (proof.publicSignals.length < 1) {
        throw new Error('Invalid proof: missing root signal')
    }
    return proof.publicSignals[0]
}

/**
 * Helper: Extract external nullifier from public signals
 */
export function getExternalNullifierFromProof(proof: ZKProofResult): string {
    if (proof.publicSignals.length < 3) {
        throw new Error('Invalid proof: missing external nullifier signal')
    }
    return proof.publicSignals[2]
}
