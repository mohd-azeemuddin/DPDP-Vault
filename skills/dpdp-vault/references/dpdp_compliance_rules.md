# India DPDP Act Technical Mapping Reference

## Section 6 — Purpose Limitation & Informed Consent
- Personal data collected for one purpose (e.g. `kyc_verification`) may not be
  silently repurposed for another (e.g. `marketing`).
- `dpdp_purpose_retrieve` enforces pre-retrieval metadata + consent status
  filtering before decrypting any AES-256-GCM chunk payload.

## Section 12 — Right to Erasure ("Crypto-Shredding")
- Deleting a relational database row does not remove semantic fragments or
  stale vector snapshots.
- Each Data Principal owns an isolated AES-256-GCM Data Encryption Key (DEK).
- Executing `dpdp_crypto_shred` destroys the DEK, purges active vectors, appends
  a SHA-256 hash-chained audit entry, and runs 5 adversarial canary probes to
  confirm 0.00% recoverability.

## Indian Identifier Validation Standards
- **Aadhaar**: 12 digits starting `[2-9]` passing the UIDAI Verhoeff dihedral
  checksum, guarded against immediate `order` / `invoice` / `utr` prefixes.
- **PAN**: 10 characters `[A-Z]{5}[0-9]{4}[A-Z]` with valid 4th-character
  taxpayer entity code (`P, C, H, F, A, T, B, L, J, G`).
- **GSTIN**: 15 characters with valid Indian state code (`01`–`38`).
- **UPI VPA**: Verified NPCI PSP handles (`@okaxis`, `@ybl`, `@oksbi`,
  `@paytm`, etc.) distinguished from regular email domains.
