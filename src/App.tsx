import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Database,
  KeyRound,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Terminal,
} from 'lucide-react';
import { ConsentVaultWorkspace } from './components/ConsentVaultWorkspace.tsx';
import { EvalBenchmarksWorkspace } from './components/EvalBenchmarksWorkspace.tsx';
import { FirewallWorkspace } from './components/FirewallWorkspace.tsx';
import { McpAuditWorkspace } from './components/McpAuditWorkspace.tsx';
import { PurposeRagWorkspace } from './components/PurposeRagWorkspace.tsx';
import type { PrincipalRecord } from './shared/types.ts';

type WorkspaceTab = 'firewall' | 'consent' | 'rag' | 'mcp' | 'evals';

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string; icon: typeof ShieldCheck }> = [
  { id: 'firewall', label: 'Privacy Firewall', icon: ShieldCheck },
  { id: 'consent', label: 'Consent & Shred', icon: KeyRound },
  { id: 'rag', label: 'Purpose-Scoped RAG', icon: Database },
  { id: 'mcp', label: 'MCP & Audit Chain', icon: Terminal },
  { id: 'evals', label: 'Eval Benchmarks', icon: BarChart3 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('firewall');
  const [darkMode, setDarkMode] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [principals, setPrincipals] = useState<PrincipalRecord[]>([]);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const refreshVaultState = useCallback(async () => {
    const [healthRes, principalsRes] = await Promise.all([
      fetch('/api/health'),
      fetch('/api/principals'),
    ]);
    if (healthRes.ok) {
      const h = await healthRes.json();
      setGeminiConfigured(Boolean(h.geminiConfigured));
    }
    if (principalsRes.ok) {
      const p = await principalsRes.json();
      setPrincipals((p.principals ?? []) as PrincipalRecord[]);
    }
  }, []);

  useEffect(() => {
    void refreshVaultState();
  }, [refreshVaultState]);

  async function handleResetDemo() {
    setResetting(true);
    try {
      const res = await fetch('/api/vault/reset', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setPrincipals((data.principals ?? []) as PrincipalRecord[]);
      }
    } finally {
      setResetting(false);
    }
  }

  const activeNav = NAV_ITEMS.find((n) => n.id === activeTab)!;

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Left Navigation Sidebar */}
      <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between">
        <div>
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <div className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              DPDP-Vault
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              India DPDP Privacy &amp; MCP Engine
            </div>
          </div>

          <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer text-left ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-emerald-600'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quiet Sidebar Summary */}
        <div className="hidden lg:block p-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
          <div className="flex items-center justify-between">
            <span>Principals</span>
            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
              {principals.filter((p) => p.status === 'ACTIVE').length} Active ·{' '}
              {principals.filter((p) => p.status === 'REVOKED').length} Shredded
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Gemini Hybrid</span>
            <span className="font-mono text-slate-800 dark:text-slate-200">
              {geminiConfigured ? 'Connected' : 'Local Only'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on Left, Primary Controls on Right */}
        <header className="h-14 px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 min-w-0">
            <span className="whitespace-nowrap">Workspace</span>
            <span aria-hidden="true">/</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {activeNav.label}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              aria-label="Toggle dark mode"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => void handleResetDemo()}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resetting ? 'Resetting...' : 'Reset Demo Vault'}
            </button>
          </div>
        </header>

        {/* Active Workspace Viewport */}
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          {activeTab === 'firewall' && <FirewallWorkspace geminiConfigured={geminiConfigured} />}
          {activeTab === 'consent' && (
            <ConsentVaultWorkspace principals={principals} onRefresh={refreshVaultState} />
          )}
          {activeTab === 'rag' && (
            <PurposeRagWorkspace principals={principals} onRefresh={refreshVaultState} />
          )}
          {activeTab === 'mcp' && <McpAuditWorkspace />}
          {activeTab === 'evals' && <EvalBenchmarksWorkspace />}
        </main>
      </div>
    </div>
  );
}
