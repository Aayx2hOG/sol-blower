import { groth16 } from 'snarkjs'
import type { ZKProofResult } from '@/lib/reporting/types'

// Verification key (from Zero-K circuits)
// This should match verification_key.json from circuits-artifacts
const VERIFICATION_KEY_JSON = {
    protocol: 'groth16',
    curve: 'bn128',
    nPublic: 3,
    vk_alpha_1: [
        '20491192805390485299153009773594534940189261866228447918068658471970481763042',
        '9383485363053290200918347156157836566562967994039712273449902621266178545958',
        '1',
    ],
    vk_beta_2: [
        [
            '4252822878758300859123897981450591353533073413197771768651442665752259397132',
            '6375614351688725206403948262868962793625744043794305715222011528459656738731',
        ],
        [
            '21847035105528745403288232691147584728191162732299865338377159692350059136679',
            '10505242626370262277552901082094356697409835680220590971873171140371331206856',
        ],
        ['1', '0'],
    ],
    vk_gamma_2: [
        [
            '11559732032986387107991004021392285783925812861821192530917403151452391805634',
            '10857046999023057135944570762232829481370756359578518086990519993285655852781',
        ],
        [
            '4082367875863433681332203403145435568316851327593401208105741076214120093531',
            '8495653923123431417604973247489272438418190587263600148770280649306958101930',
        ],
        ['1', '0'],
    ],
    vk_delta_2: [
        [
            '3364313328700514905618582263965596022423745552194653153180643293319654350400',
            '14557169560492292727906329790018469714609082177007426964745024540807179882758',
        ],
        [
            '11153646578575477866582587727988838781053233808502494850704780782846354451862',
            '12905991709030411585307882781981778460963694910877254156749178324768669568782',
        ],
        ['1', '0'],
    ],
    vk_gamma_1: [
        [
            '11559732032986387107991004021392285783925812861821192530917403151452391805634',
            '4082367875863433681332203403145435568316851327593401208105741076214120093531',
        ],
    ],
    vk_delta_1: [
        [
            '3364313328700514905618582263965596022423745552194653153180643293319654350400',
            '11153646578575477866582587727988838781053233808502494850704780782846354451862',
        ],
    ],
    vk_alphabeta_12: [
        [
            [
                '2029841028357900666629032589245290435931526318892659946355653559885299465588',
                '2701618693175432960236147200211234857651992750839141331856803299042878571663',
            ],
            [
                '2940198614761776007728859351147013310117838798424374386639230099854908064492',
                '342630361295202600952914385541265628736909332908782692974555465364282949467',
            ],
        ],
        [
            [
                '21700262052596924755504695532585274736045784870634728377848851662880245209441',
                '1536376250268395061041669497608547793521485957021490880388946752453207895056',
            ],
            [
                '9463014067489083585259093607375913128840059205160147001547831035604573723098',
                '2247634381860987832553094424181357042624143839155420345969535033473360723066',
            ],
        ],
    ],
    IC: [
        [
            '21700262052596924755504695532585274736045784870634728377848851662880245209441',
            '1536376250268395061041669497608547793521485957021490880388946752453207895056',
        ],
        [
            '9463014067489083585259093607375913128840059205160147001547831035604573723098',
            '2247634381860987832553094424181357042624143839155420345969535033473360723066',
        ],
        [
            '388426614214584276698689437077836395642215624180135516245597189863386191406',
            '21763253514704695262379516969915617137027064714215302821600090895451896049149',
        ],
        [
            '16443846415795210201998134555981798027182046427833830158870814581017573608101',
            '10292015490420786256469750245490179889041689202290547504916721350721941997977',
        ],
    ],
}

export interface ProofVerificationResult {
    ok: boolean
    nullifier?: string // Public signal: nullifier from ZK proof
    root?: string // Public signal: merkle root
    externalNullifier?: string // Public signal: external nullifier
    reason?: string // Error reason
}

/**
 * Verify a Groth16 ZK proof for membership
 * Public signals: [merkleRoot, nullifier, externalNullifier]
 */
export async function verifyZKProof(proof: ZKProofResult): Promise<ProofVerificationResult> {
    try {
        // Convert hex strings to BigInt for snarkjs
        const proofData = {
            pi_a: [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
            pi_b: [
                [BigInt(proof.pi_b[0][0]), BigInt(proof.pi_b[0][1])],
                [BigInt(proof.pi_b[1][0]), BigInt(proof.pi_b[1][1])],
            ],
            pi_c: [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
        }

        const publicSignals = proof.publicSignals.map((sig) => BigInt(sig))

        if (publicSignals.length !== 3) {
            return {
                ok: false,
                reason: 'Invalid public signals length (expected 3: root, nullifier, externalNullifier)',
            }
        }

        const isValid = await groth16.verify(VERIFICATION_KEY_JSON, publicSignals, proofData)

        if (!isValid) {
            return {
                ok: false,
                reason: 'ZK proof verification failed',
            }
        }

        return {
            ok: true,
            root: proof.publicSignals[0],
            nullifier: proof.publicSignals[1],
            externalNullifier: proof.publicSignals[2],
        }
    } catch (error) {
        return {
            ok: false,
            reason: `ZK proof verification error: ${error instanceof Error ? error.message : String(error)}`,
        }
    }
}

/**
 * Hash a nullifier to check for double-submission
 * (same nullifier = same member reporting twice)
 */
export function hashNullifier(nullifier: string): string {
    const hash = require('crypto').createHash('sha256')
    hash.update(nullifier)
    return hash.digest('hex')
}
