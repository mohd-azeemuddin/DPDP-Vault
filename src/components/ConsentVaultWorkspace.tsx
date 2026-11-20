import { useState } from 'react';
import { Download, Plus, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import type { ConsentPurpose, ErasureCertificate, PrincipalRecord } from '../shared/types.ts';

interface Props {
  principals: PrincipalRecord[];
  onRefresh: () => Promise<void>;
}

const ALL_PURPOSES: Array<{ id: ConsentPurpose; label: string }> = [
  { id: 'kyc_verification', label: 'KYC Verification' },
  { id: 'support_chat', label: 'Support Chat' },
  { id: 'loan_underwriting', label: 'Loan Underwriting' },
  { id: 'marketing', label: 'Marketing' },
];

export function ConsentVaultWorkspace({ principals, onRefresh }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [certificate, setCertificate] = useState<ErasureCertificate | null>(null);
  const [newPrincipalId, setNewPrincipalId] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  async function togglePurpose(principal: PrincipalRecord, purpose: ConsentPurpose) {
    if (principal.status === 'REVOKED') return;
    setBusyId(principal.principalId);
    setError(null);
    const nextPurposes = principal.allowedPurposes.includes(purpose)
      ? principal.allowedPurposes.filter((p) => p !== purpose)
      : [...principal.allowedPurposes, purpose];

    try {
      const res = await fetch(`/api/principals/${encodeURIComponent(principal.principalId)}/purposes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedPurposes: nextPurposes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update consent purposes');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCryptoShred(principalId: string) {
    setBusyId(principalId);
    setError(null);
    try {
      const res = await fetch('/api/consent/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ principalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Crypto-shredding failed');
      setCertificate(data.certificate as ErasureCertificate);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crypto-shredding failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreatePrincipal(e: React.FormEvent) {
    e.preventDefault();
    if (!newPrincipalId.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/principals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          principalId: newPrincipalId.trim(),
          displayName: newDisplayName.trim() || newPrincipalId.trim(),
          allowedPurposes: ['kyc_verification', 'support_chat'],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to onboard principal');
      setNewPrincipalId('');
      setNewDisplayName('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onboarding failed');
    } finally {
      setCreating(false);
    }
  }

  function downloadCertificate() {
    if (!certificate) return;
    const blob = new Blob([JSON.stringify(certificate, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${certificate.certificateId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            DPDP Section 6 & 12 Consent Ledger & Crypto-Shredding Vault
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Each Data Principal owns an isolated AES-256-GCM Data Encryption Key (DEK). Toggle purpose permissions or execute Section 12 crypto-shredding to permanently destroy the DEK and run a 5-vector adversarial canary probe.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Inline Onboard New Principal */}
        <form
          onSubmit={(e) => void handleCreatePrincipal(e)}
          className="mt-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
        >
          <input
            type="text"
            value={newPrincipalId}
            onChange={(e) => setNewPrincipalId(e.target.value)}
            placeholder="New Principal ID (e.g. usr_ananya_05)"
            pattern="[a-zA-Z0-9_-]{3,48}"
            required
            className="sm:w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
          <input
            type="text"
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.target.value)}
            placeholder="Display Name & City (e.g. Ananya Rao, Hyderabad)"
            className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {creating ? 'Issuing DEK...' : 'Onboard Principal'}
          </button>
        </form>

        <div className="mt-5 overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4 font-medium">Data Principal</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">DEK Fingerprint</th>
                <th className="py-3 px-4 font-medium">Allowed Purposes (Section 6)</th>
                <th className="py-3 px-4 font-medium text-right">Chunks</th>
                <th className="py-3 px-4 font-medium text-right">Section 12 Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {principals.map((p) => (
                <tr key={p.principalId} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {p.displayName}
                    </div>
                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {p.principalId}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {p.status === 'ACTIVE' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="w-4 h-4" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
                        <ShieldAlert className="w-4 h-4" />
                        REVOKED
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                    {p.dekFingerprint ? p.dekFingerprint : 'DESTROYED (NULL)'}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {ALL_PURPOSES.map((purpose) => (
                        <label
                          key={purpose.id}
                          className={`inline-flex items-center gap-1.5 text-xs ${
                            p.status === 'REVOKED'
                              ? 'opacity-40 cursor-not-allowed'
                              : 'cursor-pointer text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={p.allowedPurposes.includes(purpose.id)}
                            disabled={p.status === 'REVOKED' || busyId === p.principalId}
                            onChange={() => void togglePurpose(p, purpose.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="whitespace-nowrap">{purpose.label}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                    {p.chunkCount}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      disabled={p.status === 'REVOKED' || busyId === p.principalId}
                      onClick={() => void handleCryptoShred(p.principalId)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {busyId === p.principalId ? 'Shredding...' : 'Revoke & Crypto-Shred'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Erasure Certificate & Canary Audit */}
      {certificate && (
        <section className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                DPDP Section 12 Verifiable Erasure Certificate
              </h3>
              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                {certificate.certificateId} · Principal: {certificate.principalId} · Audit Hash: {certificate.auditEntryHash.slice(0, 24)}...
              </p>
            </div>
            <button
              type="button"
              onClick={downloadCertificate}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download Certificate JSON
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">DEK Key Status</div>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                {certificate.dekDestroyed ? 'Destroyed (Null)' : 'Active'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Vectors Purged</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {certificate.vectorsPurgedCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Canary Probes</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-1">
                {certificate.canarySummary.totalProbes} Executed
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Post-Erasure Leakage</div>
              <div className="text-sm font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                {certificate.canarySummary.leakageRatePercent.toFixed(2)}% (Verified)
              </div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-3 font-medium">Canary Attack Vector</th>
                  <th className="py-2.5 px-3 font-medium">Probe Query</th>
                  <th className="py-2.5 px-3 font-medium text-right">Decrypt Success</th>
                  <th className="py-2.5 px-3 font-medium text-right">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {certificate.probes.map((probe) => (
                  <tr key={probe.probeId}>
                    <td className="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">
                      {probe.attackVector}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                      {probe.query}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {probe.decryptedSuccessfully ? 'YES' : 'NO'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {probe.leaked ? 'LEAK DETECTED' : 'ZERO LEAKAGE'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
