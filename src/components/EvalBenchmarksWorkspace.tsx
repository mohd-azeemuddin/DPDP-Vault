import { useEffect, useState } from 'react';
import { BarChart3, Play } from 'lucide-react';
import type { EvalBenchmarkReport, EvalCaseResult } from '../shared/types.ts';

type CategoryFilter = 'all' | EvalCaseResult['category'];

export function EvalBenchmarksWorkspace() {
  const [report, setReport] = useState<EvalBenchmarkReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>('all');

  async function runBenchmarks() {
    setLoading(true);
    try {
      const res = await fetch('/api/eval/run');
      const data = await res.json();
      setReport(data as EvalBenchmarkReport);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runBenchmarks();
  }, []);

  const filteredCases =
    report?.cases.filter((c) => (filter === 'all' ? true : c.category === filter)) ?? [];

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Golden Indian PII & Verhoeff Trap Evaluation Suite
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Executes 16 real Hinglish chat, NPCI UPI, GSTIN/PAN, and 12-digit order-ID trap cases live on the server to quantify Precision, Recall, F1, and p95 latency.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runBenchmarks()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            {loading ? 'Running Eval...' : 'Re-Run 16-Case Suite'}
          </button>
        </div>

        {report && (
          <>
            {/* Head-to-Head Summary Metrics */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Naive Regex Baseline (Presidio-style)
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Precision</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.baseline.precision}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Recall</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.baseline.recall}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">F1 Score</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                      {report.baseline.f1}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Order Traps Failed</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-red-600 dark:text-red-400 mt-0.5">
                      {report.baseline.falsePositiveTrapsFailed}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-5">
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4" />
                  DPDP-Vault Engine (Verhoeff + Hinglish Context)
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Precision</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {report.dpdpVault.precision}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">Recall</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {report.dpdpVault.recall}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">F1 Score</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {report.dpdpVault.f1}%
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">p95 Latency</div>
                    <div className="text-xl font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {report.dpdpVault.p95LatencyMs}ms
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Category Filter */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {(
                [
                  ['all', 'All Cases'],
                  ['hinglish_chat', 'Hinglish Chat'],
                  ['verhoeff_trap', 'Verhoeff Traps'],
                  ['obfuscated_upi', 'UPI Handles'],
                  ['kyc_mixed', 'KYC Mixed'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    filter === key
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Case-by-case Diagnostics Table */}
            <div className="mt-4 overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3 font-medium">Case</th>
                    <th className="py-2.5 px-3 font-medium">Input & Diagnostic Note</th>
                    <th className="py-2.5 px-3 font-medium text-right">Naive (TP/FP/FN)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Vault (TP/FP/FN)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {filteredCases.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {c.id}
                        <div className="text-[11px] text-slate-400">{c.category}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono text-slate-800 dark:text-slate-200">{c.input}</div>
                        <div className="text-slate-500 dark:text-slate-400 mt-0.5">{c.notes}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-400 whitespace-nowrap">
                        {c.baselineTp} / {c.baselineFp} / {c.baselineFn}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {c.vaultTp} / {c.vaultFp} / {c.vaultFn}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
