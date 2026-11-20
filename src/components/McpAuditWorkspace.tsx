import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AuditEntry } from '../shared/types.ts';

interface RpcPreset {
  label: string;
  payload: Record<string, unknown>;
}

const RPC_PRESETS: RpcPreset[] = [
  {
    label: 'tools/list',
    payload: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    },
  },
  {
    label: 'dpdp_redact_text',
    payload: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'dpdp_redact_text',
        arguments: {
          text: 'Mera Aadhaar 4991 1866 5246 aur UPI aarav98@okaxis hai, order 482919203812 check karo.',
          useGeminiHybrid: false,
        },
      },
    },
  },
  {
    label: 'dpdp_purpose_retrieve (Blocked)',
    payload: {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'dpdp_purpose_retrieve',
        arguments: {
          query: 'Get Aadhaar and UPI for promo blast',
          agentRole: 'external_mcp_marketing_bot',
          requestedPurpose: 'marketing',
        },
      },
    },
  },
  {
    label: 'dpdp_audit_verify',
    payload: {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'dpdp_audit_verify',
        arguments: {},
      },
    },
  },
  {
    label: 'initialize',
    payload: {
      jsonrpc: '2.0',
      id: 5,
      method: 'initialize',
      params: {},
    },
  },
];

export function McpAuditWorkspace() {
  const [rpcBody, setRpcBody] = useState(JSON.stringify(RPC_PRESETS[0].payload, null, 2));
  const [rpcResponse, setRpcResponse] = useState<string>('');
  const [rpcLoading, setRpcLoading] = useState(false);

  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [chainValid, setChainValid] = useState<boolean>(true);
  const [brokenIdx, setBrokenIdx] = useState<number | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [tamperReport, setTamperReport] = useState<string | null>(null);

  async function loadAudit() {
    setAuditLoading(true);
    try {
      const res = await fetch('/api/audit');
      const data = await res.json();
      setAuditEntries((data.entries ?? []) as AuditEntry[]);
      setChainValid(Boolean(data.verification?.valid));
      setBrokenIdx(data.verification?.brokenAtIndex ?? null);
    } finally {
      setAuditLoading(false);
    }
  }

  async function runTamperTest() {
    const res = await fetch('/api/audit/simulate-tamper', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.verification && !data.verification.valid) {
      setTamperReport(
        `In-memory mutation on entry #${data.mutatedIndex} immediately detected as invalid at chain index #${data.verification.brokenAtIndex} (live ledger unchanged).`,
      );
    }
  }

  useEffect(() => {
    void loadAudit();
  }, []);

  async function sendRpc(overrideBody?: string) {
    setRpcLoading(true);
    try {
      const parsed = JSON.parse(overrideBody ?? rpcBody);
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setRpcResponse(JSON.stringify(data, null, 2));
      await loadAudit();
    } catch (err) {
      setRpcResponse(
        JSON.stringify(
          { error: err instanceof Error ? err.message : 'Invalid JSON-RPC payload' },
          null,
          2,
        ),
      );
    } finally {
      setRpcLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* MCP JSON-RPC 2.0 Inspector */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              01. Model Context Protocol (MCP) JSON-RPC 2.0 Endpoint
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Test live JSON-RPC calls against <code className="font-mono text-xs">POST /api/mcp</code> so external LangGraph, Claude, or Cursor agents enforce DPDP gates automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void sendRpc()}
            disabled={rpcLoading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {rpcLoading ? 'Sending...' : 'Execute JSON-RPC'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {RPC_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const formatted = JSON.stringify(preset.payload, null, 2);
                setRpcBody(formatted);
                void sendRpc(formatted);
              }}
              className="px-3 py-1.5 text-xs font-mono rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Request Payload (JSON-RPC 2.0)
            </div>
            <textarea
              value={rpcBody}
              onChange={(e) => setRpcBody(e.target.value)}
              rows={12}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Server Response
            </div>
            <pre className="h-[264px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
              {rpcResponse || 'Click a preset or "Execute JSON-RPC" to invoke the MCP server.'}
            </pre>
          </div>
        </div>
      </section>

      {/* Tamper-Evident SHA-256 Audit Chain */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              02. Tamper-Evident SHA-256 Hash-Chained Audit Ledger
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Every consent grant, ingest, policy denial, and crypto-shredding event chains into the previous SHA-256 entry hash.
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {chainValid ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                <CheckCircle2 className="w-4 h-4" />
                SHA-256 Chain Verified ({auditEntries.length} events)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                <ShieldAlert className="w-4 h-4" />
                Chain Broken at #{brokenIdx}
              </span>
            )}
            <button
              type="button"
              onClick={() => void runTamperTest()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-800 dark:text-amber-300 cursor-pointer whitespace-nowrap"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Test Tamper Detection
            </button>
            <button
              type="button"
              onClick={() => void loadAudit()}
              disabled={auditLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Re-Verify Chain
            </button>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(auditEntries, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'dpdp-audit-chain.json';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
          </div>
        </div>

        {tamperReport && (
          <div className="mt-4 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 text-xs font-mono text-amber-900 dark:text-amber-300">
            {tamperReport}
          </div>
        )}

        <div className="mt-5 overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 font-medium">#</th>
                <th className="py-2.5 px-3 font-medium">Event</th>
                <th className="py-2.5 px-3 font-medium">Principal</th>
                <th className="py-2.5 px-3 font-medium">Details</th>
                <th className="py-2.5 px-3 font-medium">Entry SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {[...auditEntries].reverse().map((entry) => (
                <tr key={entry.index} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500">
                    {entry.index}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {entry.event}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                    {entry.principalId}
                  </td>
                  <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                    {entry.details}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">
                    {entry.entryHash.slice(0, 16)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
