import { useState } from 'react';
import { Database, Lock, Search, ShieldX } from 'lucide-react';
import type { ConsentPurpose, PrincipalRecord, RagQueryResult } from '../shared/types.ts';

interface Props {
  principals: PrincipalRecord[];
  onRefresh: () => Promise<void>;
}

const AGENT_PRESETS: Array<{ role: string; purpose: ConsentPurpose; sampleQuery: string }> = [
  {
    role: 'Support Ops Agent',
    purpose: 'support_chat',
    sampleQuery: 'What UPI issue did Aarav report and which invoice number?',
  },
  {
    role: 'Marketing Growth Bot',
    purpose: 'marketing',
    sampleQuery: 'List customer phone numbers and Aadhaar details for promo campaign',
  },
  {
    role: 'KYC Compliance Agent',
    purpose: 'kyc_verification',
    sampleQuery: 'Summarize KYC verification documents submitted by Aarav or Vikram',
  },
  {
    role: 'MSME Credit Underwriter',
    purpose: 'loan_underwriting',
    sampleQuery: 'What is Priya monthly UPI turnover and GSTIN/IFSC status?',
  },
];

export function PurposeRagWorkspace({ principals, onRefresh }: Props) {
  // Ingest state
  const [principalId, setPrincipalId] = useState('usr_meera_04');
  const [displayName, setDisplayName] = useState('Meera Iyer (Chennai)');
  const [ingestPurpose, setIngestPurpose] = useState<ConsentPurpose>('support_chat');
  const [rawText, setRawText] = useState(
    'Customer Meera Iyer (Aadhaar 4991 1866 5246) requested refund on UPI meera@okicici for order 991234567890.',
  );
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Query state
  const [selectedAgentIdx, setSelectedAgentIdx] = useState(0);
  const [queryText, setQueryText] = useState(AGENT_PRESETS[0].sampleQuery);
  const [principalFilter, setPrincipalFilter] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [ragResult, setRagResult] = useState<RagQueryResult | null>(null);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    setIngestLoading(true);
    setIngestError(null);
    setIngestMessage(null);
    try {
      const res = await fetch('/api/rag/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          principalId,
          displayName,
          purpose: ingestPurpose,
          rawText,
          useGeminiHybrid: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingest failed');
      setIngestMessage(
        `Ingested ${data.chunkId} · ${data.entitiesCount} PII token(s) scrubbed · Encrypted with DEK ${data.dekFingerprint} · Gemini Vector: ${data.embeddedWithGemini ? 'Yes' : 'BM25 fallback'}`,
      );
      await onRefresh();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setIngestLoading(false);
    }
  }

  async function handleQuery(e?: React.FormEvent) {
    e?.preventDefault();
    const preset = AGENT_PRESETS[selectedAgentIdx];
    setQueryLoading(true);
    setQueryError(null);
    try {
      const res = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: queryText,
          agentRole: preset.role,
          requestedPurpose: preset.purpose,
          principalIdFilter: principalFilter || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Query failed');
      setRagResult(data as RagQueryResult);
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Purpose-Scoped Agent Query */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            01. Purpose-Scoped RAG Agent Simulator
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Switch agent roles to test DPDP Section 6 pre-retrieval policy enforcement. Marketing agents cannot decrypt KYC or support chunks, and revoked principals are immediately isolated.
          </p>
        </div>

        {/* Agent Role Segmented Selector */}
        <div className="mt-5 flex flex-wrap gap-2">
          {AGENT_PRESETS.map((preset, idx) => (
            <button
              key={preset.role}
              type="button"
              onClick={() => {
                setSelectedAgentIdx(idx);
                setQueryText(preset.sampleQuery);
              }}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedAgentIdx === idx
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {preset.role} ({preset.purpose})
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleQuery(e)} className="mt-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Ask a question across encrypted vault records..."
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
          <select
            value={principalFilter}
            onChange={(e) => setPrincipalFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-800 dark:text-slate-200"
          >
            <option value="">All Principals</option>
            {principals.map((p) => (
              <option key={p.principalId} value={p.principalId}>
                {p.principalId} ({p.status})
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={queryLoading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Search className="w-4 h-4" />
            {queryLoading ? 'Querying...' : 'Query Vault'}
          </button>
        </form>

        {queryError && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {queryError}
          </div>
        )}

        {ragResult && (
          <div className="mt-6 space-y-5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
              <div className="flex items-center justify-between gap-2 mb-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Response for <strong>{ragResult.agentRole}</strong> · Purpose:{' '}
                  <span className="font-mono">{ragResult.requestedPurpose}</span>
                </span>
                <span className="font-mono tabular-nums">{ragResult.latencyMs} ms</span>
              </div>
              <p className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                {ragResult.answer}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Authorized & Decrypted Chunks ({ragResult.retrievedChunks.length})
                </h3>
                {ragResult.retrievedChunks.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    Zero chunks passed the policy gate.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ragResult.retrievedChunks.map((c) => (
                      <div
                        key={c.chunkId}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between font-mono text-slate-500 dark:text-slate-400 mb-1">
                          <span>
                            {c.chunkId} · {c.principalId}
                          </span>
                          <span className="tabular-nums">score {c.score}</span>
                        </div>
                        <p className="text-slate-800 dark:text-slate-200 font-mono leading-relaxed">
                          {c.decryptedPreview}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-red-700 dark:text-red-400 mb-2 flex items-center gap-1.5">
                  <ShieldX className="w-3.5 h-3.5" />
                  Policy Gate Denials ({ragResult.blockedCount})
                </h3>
                {ragResult.blockedReasons.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-lg p-3">
                    No chunks blocked for this scope.
                  </p>
                ) : (
                  <ul className="space-y-2 border border-slate-200 dark:border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-600 dark:text-slate-400">
                    {ragResult.blockedReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Ingest New Record */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            02. Ingest & Encrypt New Record
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
            Scrubs PII first, computes semantic vector strictly on redacted text, and encrypts payload with the principal’s AES-256-GCM DEK.
          </p>
        </div>

        <form onSubmit={(e) => void handleIngest(e)} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Principal ID
              </label>
              <input
                type="text"
                value={principalId}
                onChange={(e) => setPrincipalId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Allowed DPDP Purpose
              </label>
              <select
                value={ingestPurpose}
                onChange={(e) => setIngestPurpose(e.target.value as ConsentPurpose)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="support_chat">support_chat</option>
                <option value="kyc_verification">kyc_verification</option>
                <option value="loan_underwriting">loan_underwriting</option>
                <option value="marketing">marketing</option>
              </select>
            </div>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              disabled={ingestLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              {ingestLoading ? 'Encrypting...' : 'Scrub, Encrypt & Ingest'}
            </button>

            {ingestMessage && (
              <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                {ingestMessage}
              </span>
            )}
            {ingestError && (
              <span className="text-xs text-red-600 dark:text-red-400">{ingestError}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
