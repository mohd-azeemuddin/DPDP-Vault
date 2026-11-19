# DPDP-Vault — Consent-Bound RAG, Hinglish PII Firewall & Crypto-Shredding MCP Server

An open-source privacy & compliance engineering workbench built for **India's Digital Personal Data Protection (DPDP) Act**.

Instead of a commodity regex PII masker, **DPDP-Vault** solves the real production bottlenecks facing Indian AI startups:
1. **DPDP Section 12 Right-to-Erasure for Vector Stores ("Crypto-Shredding"):** Every Data Principal gets an isolated **AES-256-GCM Data Encryption Key (DEK)**. Revoking consent destroys the DEK, purges vector chunks, runs a **5-Vector Adversarial Canary Probe**, and issues a SHA-256 **Erasure Certificate** proving `0.00%` data recoverability even from stale backup snapshots.
2. **DPDP Section 6 Purpose-Scoped Retrieval:** Pre-retrieval policy gates prevent cross-purpose agent leakage (e.g., a *Marketing Agent* cannot decrypt records collected for *KYC Verification*).
3. **Hinglish + Indian Identity Firewall:** Combines the **UIDAI Verhoeff Checksum** (eliminating false positives on 12-digit order/invoice numbers), PAN/GSTIN/IFSC/NPCI UPI VPA validators, Hinglish context cues, and **Gemini (`gemini-4-hydrogen`)** contextual NER + screenshot bounding-box redaction.
4. **Native Model Context Protocol (MCP) Server:** Exposes `dpdp_redact_text`, `dpdp_safe_ingest`, `dpdp_purpose_retrieve`, and `dpdp_crypto_shred` via standard JSON-RPC 2.0 at `POST /api/mcp`.

---

## Architecture

```text
Ingress Text / Screenshot ──► Indian PII Firewall (Verhoeff + Hinglish + Gemini Vision)
                                       │
                                       ▼
                        AES-256-GCM Per-Principal DEK Wrap
                                       │
                                       ▼
           Purpose-Scoped Hybrid Store (gemini-embedding-2 + BM25)
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
  MCP Server (/api/mcp)                                   Section 12 Crypto-Shred
  Purpose Gate + Grounded RAG                             DEK Purge + 5-Vector Canary Probe
```

---

## Free-Tier Cloud Deployment (No Credit Card Required)

### Option 1: Render Free Tier (Recommended)
1. Push this repository to GitHub.
2. On [Render](https://render.com), click **New + → Blueprint** and connect your repository (`render.yaml` is pre-configured).
3. Add `GEMINI_API_KEY` (free from Google AI Studio) in Environment Variables.
4. Deploy on the **Free** plan (`NODE_ENV=production node server.ts`).

### Option 2: Local Development
```bash
npm install
cp .env.example .env
# Add GEMINI_API_KEY in .env
npm run dev
```

---

## Live Evaluation Benchmark
Run the built-in 16-case Hinglish & Verhoeff false-positive trap suite from the **Eval Benchmarks** tab or via `GET /api/eval/run` to inspect live Precision, Recall, F1, and p95 latency against a naive regex baseline.
