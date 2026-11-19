export type PiiEntityType =
  | 'AADHAAR'
  | 'PAN'
  | 'UPI_ID'
  | 'PHONE_IN'
  | 'GSTIN'
  | 'IFSC'
  | 'EMAIL'
  | 'PERSON_NAME'
  | 'ADDRESS';

export type ConsentPurpose =
  | 'kyc_verification'
  | 'support_chat'
  | 'loan_underwriting'
  | 'marketing';

export interface DetectedEntity {
  type: PiiEntityType;
  value: string;
  token: string;
  start: number;
  end: number;
  confidence: number;
  method: 'verhoeff_checksum' | 'indian_pattern' | 'hinglish_context' | 'gemini_ner';
  note?: string;
}

export interface FirewallAnalysisResult {
  originalLength: number;
  redactedText: string;
  entities: DetectedEntity[];
  tokenVault: Record<string, string>;
  baselineNaive: {
    redactedText: string;
    entities: Array<{ type: string; value: string; start: number; end: number }>;
    falsePositivesCaughtByVault: number;
    missedHinglishCaughtByVault: number;
  };
  latencyMs: number;
  mode: 'deterministic_only' | 'hybrid_gemini';
}

export interface ImageRedactionBox {
  type: PiiEntityType;
  text: string;
  box2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
  confidence: number;
}

export interface ImageRedactionResult {
  boxes: ImageRedactionBox[];
  summary: string;
  latencyMs: number;
}

export interface PrincipalRecord {
  principalId: string;
  displayName: string;
  status: 'ACTIVE' | 'REVOKED';
  allowedPurposes: ConsentPurpose[];
  createdAt: string;
  revokedAt?: string;
  dekPresent: boolean;
  dekFingerprint: string | null;
  chunkCount: number;
}

export interface AuditEntry {
  index: number;
  timestamp: string;
  event:
    | 'CONSENT_GRANTED'
    | 'PURPOSE_UPDATED'
    | 'CHUNK_INGESTED'
    | 'RETRIEVAL_ALLOWED'
    | 'RETRIEVAL_BLOCKED'
    | 'CRYPTO_SHRED_EXECUTED'
    | 'CANARY_AUDIT_PASSED';
  principalId: string;
  details: string;
  prevHash: string;
  entryHash: string;
}

export interface CanaryProbeItem {
  probeId: string;
  attackVector: string;
  query: string;
  chunksMatched: number;
  decryptionAttempted: boolean;
  decryptedSuccessfully: boolean;
  leaked: boolean;
}

export interface ErasureCertificate {
  certificateId: string;
  dpdpSection: 'Section 12 (Right to Erasure)';
  principalId: string;
  revokedAt: string;
  dekDestroyed: boolean;
  vectorsPurgedCount: number;
  auditEntryHash: string;
  canarySummary: {
    totalProbes: number;
    leaksDetected: number;
    leakageRatePercent: number;
    verified: boolean;
  };
  probes: CanaryProbeItem[];
}

export interface RagQueryResult {
  agentRole: string;
  requestedPurpose: ConsentPurpose;
  answer: string;
  retrievedChunks: Array<{
    chunkId: string;
    principalId: string;
    purpose: ConsentPurpose;
    score: number;
    decryptedPreview: string;
  }>;
  blockedCount: number;
  blockedReasons: string[];
  latencyMs: number;
}

export interface EvalCaseResult {
  id: string;
  category: 'hinglish_chat' | 'verhoeff_trap' | 'obfuscated_upi' | 'kyc_mixed';
  input: string;
  expectedCount: number;
  baselineTp: number;
  baselineFp: number;
  baselineFn: number;
  vaultTp: number;
  vaultFp: number;
  vaultFn: number;
  notes: string;
}

export interface EvalBenchmarkReport {
  totalCases: number;
  baseline: {
    precision: number;
    recall: number;
    f1: number;
    falsePositiveTrapsFailed: number;
    p95LatencyMs: number;
  };
  dpdpVault: {
    precision: number;
    recall: number;
    f1: number;
    falsePositiveTrapsFailed: number;
    p95LatencyMs: number;
  };
  cases: EvalCaseResult[];
}
