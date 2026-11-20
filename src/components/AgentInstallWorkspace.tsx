import { useEffect, useState } from 'react';
import { Check, Copy, Download, ShieldCheck, Terminal } from 'lucide-react';

type ClientTarget = 'claude_stdio' | 'cursor_stdio' | 'remote_http';

export function AgentInstallWorkspace() {
  const [skillMarkdown, setSkillMarkdown] = useState<string>('');
  const [clientTarget, setClientTarget] = useState<ClientTarget>('claude_stdio');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/skill');
      if (res.ok) {
        const data = (await res.json()) as { skillMarkdown?: string };
        setSkillMarkdown(data.skillMarkdown ?? '');
      }
    })();
  }, []);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://dpdp-vault.onrender.com';

  const configSnippets: Record<ClientTarget, { title: string; filename: string; code: string }> = {
    claude_stdio: {
      title: 'Claude Code / Claude Desktop (Local Stdio MCP)',
      filename: 'claude_desktop_config.json',
      code: JSON.stringify(
        {
          mcpServers: {
            'dpdp-vault': {
              command: 'node',
              args: ['/path/to/dpdp-vault/mcp-stdio.ts'],
              env: {
                GEMINI_API_KEY: 'optional-for-hybrid-ner',
              },
            },
          },
        },
        null,
        2,
      ),
    },
    cursor_stdio: {
      title: 'Cursor / Windsurf (.cursor/mcp.json)',
      filename: '.cursor/mcp.json',
      code: JSON.stringify(
        {
          mcpServers: {
            'dpdp-vault': {
              command: 'npx',
              args: ['tsx', 'mcp-stdio.ts'],
            },
          },
        },
        null,
        2,
      ),
    },
    remote_http: {
      title: 'Remote Hosted HTTP MCP Endpoint',
      filename: 'mcp-remote.json',
      code: JSON.stringify(
        {
          mcpServers: {
            'dpdp-vault': {
              type: 'http',
              url: `${origin}/api/mcp`,
              headers: {
                Authorization: 'Bearer YOUR_DPDP_API_TOKEN_IF_SET',
              },
            },
          },
        },
        null,
        2,
      ),
    },
  };

  async function copyText(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
  }

  function downloadSkillMd() {
    if (!skillMarkdown) return;
    const blob = new Blob([skillMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeSnippet = configSnippets[clientTarget];

  return (
    <div className="space-y-8">
      {/* Agensi.io Packaging & Agent Config */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            01. Connect DPDP-Vault to Claude Code, Cursor &amp; Copilot
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Includes both a standard <code className="font-mono text-xs">stdio</code> MCP server (<code className="font-mono text-xs">mcp-stdio.ts</code>) and an HTTP JSON-RPC endpoint (<code className="font-mono text-xs">POST /api/mcp</code>) paired with an Agensi-ready <code className="font-mono text-xs">SKILL.md</code> playbook.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(
            [
              ['claude_stdio', 'Claude Code / Desktop (Stdio)'],
              ['cursor_stdio', 'Cursor / Windsurf (Stdio)'],
              ['remote_http', 'Hosted Cloud (HTTP MCP)'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setClientTarget(key)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                clientTarget === key
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:border-emerald-600'
                  : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              <span>{activeSnippet.title}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono text-slate-500">{activeSnippet.filename}</span>
            </div>
            <button
              type="button"
              onClick={() => void copyText('config', activeSnippet.code)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              {copiedId === 'config' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy Config
                </>
              )}
            </button>
          </div>
          <pre className="font-mono text-xs text-slate-800 dark:text-slate-200 overflow-x-auto leading-relaxed">
            {activeSnippet.code}
          </pre>
        </div>

        {/* Security & Safety Checklist */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 pt-5 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Zero Plaintext Vector Leakage
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              PII is scrubbed before embedding, and chunks are encrypted per Data Principal with AES-256-GCM DEKs.
            </p>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Hardened HTTP &amp; MCP Guardrails
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Sliding-window IP rate limits, 20k-char/4MB caps, strict enum/ID regex checks, and optional Bearer auth.
            </p>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Agensi Skill Zip Ready
            </div>
            <p className="text-slate-600 dark:text-slate-400">
              Zip <code className="font-mono">skills/dpdp-vault/</code> (<code className="font-mono">SKILL.md</code> + <code className="font-mono">references/</code>) to upload directly on <code className="font-mono">agensi.io/sell</code>.
            </p>
          </div>
        </div>
      </section>

      {/* Live SKILL.md Preview */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              02. Packaged Agensi Skill Playbook (skills/dpdp-vault/SKILL.md)
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Teaches AI coding and compliance agents when to scrub Hinglish PII, lock RAG purposes, and execute Section 12 crypto-shredding.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void copyText('skill', skillMarkdown)}
              disabled={!skillMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
            >
              {copiedId === 'skill' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedId === 'skill' ? 'Copied' : 'Copy SKILL.md'}
            </button>
            <button
              type="button"
              onClick={downloadSkillMd}
              disabled={!skillMarkdown}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Download SKILL.md
            </button>
          </div>
        </div>

        <pre className="mt-4 max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 font-mono text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
          {skillMarkdown || 'Loading SKILL.md...'}
        </pre>
      </section>
    </div>
  );
}
