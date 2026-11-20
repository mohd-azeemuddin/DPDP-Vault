---
name: dpdp-vault
description: >
  India DPDP Act (2023) compliance firewall and MCP server for AI agents. Use
  whenever handling Indian user data (Aadhaar, PAN, GSTIN, IFSC, UPI VPAs,
  +91/Hinglish phone numbers, addresses), ingesting customer records into RAG,
  enforcing purpose-limited retrieval (Section 6), or executing verifiable
  Right-to-Erasure crypto-shredding (Section 12).
version: 1.0.0
license: Apache-2.0
---

# DPDP-Vault Agent Skill

You have access to the **dpdp-vault-mcp** server. Follow these mandatory
compliance rules whenever processing Indian personal data or managing RAG
knowledge bases.

## When to Trigger This Skill

Invoke the `dpdp-vault-mcp` tools automatically whenever a user or workflow:
1. Pastes Indian customer messages, support tickets, KYC transcripts, or
   Hinglish chat logs containing potential PII before sending them to an LLM.
2. Stores or retrieves user records in an AI knowledge base or agent memory.
3. Requests consent updates, purpose checks (`kyc_verification`,
   `support_chat`, `loan_underwriting`, `marketing`), or data deletion.
4. Needs cryptographic proof or an audit check under India's DPDP Act.

## Mandatory Tool Workflow

### 1. Ingress Scrubbing (`dpdp_redact_text`)
- **Always** call `dpdp_redact_text` on untrusted Indian/Hinglish text *before*
  summarizing, logging, or forwarding it to external APIs.
- Preserve returned placeholder tokens (e.g., `<AADHAAR_1>`, `<PAN_1>`,
  `<UPI_ID_1>`) verbatim—never attempt to guess or reconstruct original values.
- Rely on UIDAI Verhoeff validation so 12-digit invoice or order IDs are not
  falsely redacted as Aadhaar numbers.

### 2. Encrypted & Purpose-Tagged Storage (`dpdp_safe_ingest`)
- Never write raw personal data to plaintext vector stores or logs.
- Call `dpdp_safe_ingest` with an explicit `principalId` and a valid Section 6
  `purpose` (`kyc_verification`, `support_chat`, `loan_underwriting`, or
  `marketing`).

### 3. Purpose-Locked Retrieval (`dpdp_purpose_retrieve`)
- Always pass your active `agentRole` and narrow `requestedPurpose`.
- If the tool returns `blockedCount > 0` and `0` retrieved chunks, **refuse**
  the request cleanly and state that DPDP Section 6 purpose limitation or
  Section 12 consent revocation blocked access. Never attempt a broader
  purpose override.

### 4. Right to Erasure (`dpdp_crypto_shred`)
- When a Data Principal revokes consent or requests deletion, call
  `dpdp_crypto_shred` with their `principalId`.
- Return the generated `certificateId`, `auditEntryHash`, and
  `canarySummary` (`0.00%` leakage across 5 adversarial probes) as proof of
  compliance.

### 5. Integrity Verification (`dpdp_audit_verify`)
- Call `dpdp_audit_verify` whenever an audit report or compliance check is
  requested to verify the SHA-256 hash chain has zero tampering.

## Safety & Refusal Rules

- Never store or expose unmasked Aadhaar, PAN, or UPI IDs inside vector
  embeddings or agent long-term memory.
- Never bypass a `REVOKED` status or mismatch between `agentRole` and
  `requestedPurpose`.
- Read [references/dpdp_compliance_rules.md](references/dpdp_compliance_rules.md)
  for statutory mapping details.
