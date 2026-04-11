# Phase 1: Discovery and Assumptions

## Scope
This repository is being shaped into a Solana-native anonymous whistleblower platform. Phase 1 locks the core product assumptions so later phases can move directly into architecture, program design, and implementation.

## Locked Decisions

### Chain and runtime
- Solana only.
- Anchor is the on-chain framework.
- No Ethereum, no EVM, no Hardhat, and no cross-chain assumptions.
- Target behavior must fit Solana account and PDA constraints.

### Privacy model
- Reporter anonymity is preserved on-chain.
- Organization membership is proven without revealing identity.
- Reports are encrypted client-side before submission.
- On-chain state stores only commitments, metadata, and audit trail fields required for verification and indexing.

### ZK strategy
- Use Circom/Groth16 as the primary zero-knowledge pipeline.
- Proof generation happens off-chain.
- Verification happens in the Solana program through a verifier-compatible path.
- Trust assumption: a trusted setup is required per circuit and must be documented and versioned.

### Membership model
- Membership is represented by Merkle-root-based commitments.
- Each organization can rotate roots by epoch or version.
- One active root is preferred per epoch, with controlled overlap only if required for submission continuity.
- The proof must bind to org identity and epoch to prevent cross-org replay.

### Nullifier and replay protection
- Each report submission must consume a unique nullifier.
- Nullifiers are scoped to org and epoch via domain separation.
- Double submission must fail deterministically on-chain.

### Encryption and retrieval
- Ciphertext lives off-chain.
- On-chain data stores ciphertext hash, reference, size, org, epoch, and submission commitment.
- Decryption is performed off-chain by authorized actors using a clearly defined key lifecycle.
- The design must support auditable access without exposing reporter identity.

### Authority model
- Organizations have admin authority for configuration and membership root updates.
- An optional multisig upgrade path should be designed in from the start.
- Program upgrade authority must be treated as a production security concern, not an implementation detail.

### Anti-spam strategy
- Use a refundable lamport bond as the default protocol-level anti-spam mechanism.
- Combine the bond with nullifier uniqueness and optional per-org submission throttling.
- Keep the mechanism Solana-native and inexpensive.

### Deployment stance
- Devnet-first implementation, but production-safe semantics from day one.
- Local validator support is required for tests and reproducible demos.
- Mainnet readiness should not require redesign, only configuration changes and operational hardening.

## Ambiguities Resolved

The following choices are now fixed for implementation:
- Circom/Groth16 is the ZK route.
- Merkle-root membership is the membership model.
- Ciphertext is off-chain.
- Admin-controlled org configuration is the authority model, with multisig as the upgrade path.
- Refundable lamport bond is the anti-spam model.
- Devnet is the first deployment target.

## Residual Risks to Carry Forward
- Trusted setup ceremony management for Groth16 circuits.
- Proof verification cost on Solana and the resulting compute budget.
- Storage and retrieval availability for off-chain ciphertext.
- Operational key management for decryption authority.
- Upgrade authority abuse or misconfiguration.
- Bond economics and whether the amount is sufficient to deter abuse.

## Notes for Later Phases
Phase 2 should define:
- Program/module boundaries.
- Account schemas and PDA seeds.
- Instruction list with signer and permission matrix.
- ZK verification flow and exact on-chain verifier integration.
- Event schema for indexers and analytics.

Phase 3 should define:
- Monorepo layout.
- Shared TypeScript SDK structure.
- Frontend split between admin and reporter apps.
- Test strategy, deployment scripts, and local validator workflow.
