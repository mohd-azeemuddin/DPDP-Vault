import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { verifyAuditChain } from './src/server/cryptoVault.ts';
import { runGoldenEvalBenchmark } from './src/server/evalSuite.ts';
import { analyzeWithFirewall } from './src/server/firewallService.ts';
import { detectImagePiiBoxes, hasGeminiKey } from './src/server/geminiClient.ts';
import { handleMcpJsonRpc, type McpJsonRpcRequest } from './src/server/mcpHandler.ts';
import {
  createPrincipal,
  getAuditLog,
  ingestRecord,
  listPrincipals,
  queryPurposeScopedRag,
  resetVaultDatabase,
  revokeAndCryptoShred,
  updatePrincipalPurposes,
} from './src/server/ragStore.ts';
import type { ConsentPurpose } from './src/shared/types.ts';

const VALID_PURPOSES = new Set<ConsentPurpose>([
  'kyc_verification',
  'support_chat',
  'loan_underwriting',
  'marketing',
]);

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PRINCIPAL_ID_REGEX = /^[a-zA-Z0-9_-]{3,48}$/;

function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (buckets.get(ip) ?? []).filter((t) => t > cutoff);
    if (recent.length >= maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      res.status(429).json({
        error: `Rate limit exceeded (${maxRequests} requests per ${Math.round(windowMs / 1000)}s). Please retry shortly.`,
      });
      return;
    }
    recent.push(now);
    buckets.set(ip, recent);
    if (buckets.size > 1000) {
      buckets.clear();
    }
    next();
  };
}

function optionalBearerAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredToken = process.env.DPDP_API_TOKEN?.trim();
  if (!configuredToken) {
    next();
    return;
  }
  const authHeader = req.headers.authorization ?? '';
  const candidate = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const a = Buffer.from(candidate);
  const b = Buffer.from(configuredToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'Unauthorized: valid DPDP_API_TOKEN Bearer token required.' });
    return;
  }
  next();
}

function sanitizePurposes(input: unknown): ConsentPurpose[] {
  if (!Array.isArray(input)) {
    throw new Error('allowedPurposes must be an array.');
  }
  const filtered: ConsentPurpose[] = [];
  for (const item of input) {
    if (typeof item === 'string' && VALID_PURPOSES.has(item as ConsentPurpose)) {
      if (!filtered.includes(item as ConsentPurpose)) {
        filtered.push(item as ConsentPurpose);
      }
    } else {
      throw new Error(`Invalid DPDP purpose: ${String(item)}`);
    }
  }
  return filtered;
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  const standardLimiter = createRateLimiter(90, 60_000);
  const aiHeavyLimiter = createRateLimiter(20, 60_000);

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: hasGeminiKey(),
      tokenProtected: Boolean(process.env.DPDP_API_TOKEN?.trim()),
      nodeVersion: process.version,
    });
  });

  app.get('/api/skill', (_req, res) => {
    const skillPath = path.resolve(process.cwd(), 'skills/dpdp-vault/SKILL.md');
    if (!fs.existsSync(skillPath)) {
      res.status(404).json({ error: 'SKILL.md not found.' });
      return;
    }
    res.json({
      skillMarkdown: fs.readFileSync(skillPath, 'utf8'),
    });
  });

  app.post('/api/firewall/analyze', standardLimiter, async (req, res) => {
    try {
      const { text, useGeminiHybrid } = req.body as {
        text?: string;
        useGeminiHybrid?: boolean;
      };
      if (!text || typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: 'Request body must include non-empty "text".' });
        return;
      }
      if (text.length > 20_000) {
        res.status(400).json({ error: 'Input text exceeds 20,000 character safety cap.' });
        return;
      }
      const result = await analyzeWithFirewall({
        text,
        useGeminiHybrid: Boolean(useGeminiHybrid),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Firewall analysis failed',
      });
    }
  });

  app.post('/api/firewall/redact-image', aiHeavyLimiter, async (req, res) => {
    const startNs = performance.now();
    try {
      const { imageBase64, mimeType } = req.body as {
        imageBase64?: string;
        mimeType?: string;
      };
      if (!imageBase64 || !mimeType) {
        res.status(400).json({ error: 'imageBase64 and mimeType are required.' });
        return;
      }
      if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
        res.status(400).json({ error: 'Unsupported image MIME type. Use PNG, JPEG, or WebP.' });
        return;
      }
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      if (cleanBase64.length > 5_500_000) {
        res.status(413).json({ error: 'Image exceeds 4MB safety limit.' });
        return;
      }
      const { boxes, summary } = await detectImagePiiBoxes(cleanBase64, mimeType);
      res.json({
        boxes,
        summary,
        latencyMs: Number((performance.now() - startNs).toFixed(2)),
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Image PII redaction failed',
      });
    }
  });

  app.get('/api/principals', (_req, res) => {
    res.json({ principals: listPrincipals() });
  });

  app.post('/api/principals', standardLimiter, optionalBearerAuth, (req, res) => {
    try {
      const { principalId, displayName, allowedPurposes } = req.body as {
        principalId?: string;
        displayName?: string;
        allowedPurposes?: ConsentPurpose[];
      };
      if (!principalId || !PRINCIPAL_ID_REGEX.test(principalId.trim())) {
        res
          .status(400)
          .json({ error: 'principalId must be 3-48 alphanumeric, underscore, or hyphen characters.' });
        return;
      }
      const principal = createPrincipal({
        principalId: principalId.trim(),
        displayName: String(displayName ?? principalId).slice(0, 80),
        allowedPurposes: sanitizePurposes(allowedPurposes ?? ['support_chat']),
      });
      res.status(201).json({ principal });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to create principal',
      });
    }
  });

  app.patch('/api/principals/:principalId/purposes', standardLimiter, optionalBearerAuth, (req, res) => {
    try {
      const { principalId } = req.params;
      if (!PRINCIPAL_ID_REGEX.test(principalId)) {
        res.status(400).json({ error: 'Invalid principalId format.' });
        return;
      }
      const { allowedPurposes } = req.body as { allowedPurposes?: ConsentPurpose[] };
      const updated = updatePrincipalPurposes(principalId, sanitizePurposes(allowedPurposes));
      res.json({ principal: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update purposes',
      });
    }
  });

  app.post('/api/rag/ingest', standardLimiter, optionalBearerAuth, async (req, res) => {
    try {
      const { principalId, displayName, purpose, rawText, useGeminiHybrid } = req.body as {
        principalId?: string;
        displayName?: string;
        purpose?: ConsentPurpose;
        rawText?: string;
        useGeminiHybrid?: boolean;
      };
      if (!principalId || !PRINCIPAL_ID_REGEX.test(principalId.trim())) {
        res
          .status(400)
          .json({ error: 'principalId must be 3-48 alphanumeric, underscore, or hyphen characters.' });
        return;
      }
      if (!purpose || !VALID_PURPOSES.has(purpose)) {
        res.status(400).json({ error: 'Valid DPDP purpose is required.' });
        return;
      }
      if (!rawText || typeof rawText !== 'string' || !rawText.trim() || rawText.length > 20_000) {
        res.status(400).json({ error: 'rawText must be between 1 and 20,000 characters.' });
        return;
      }
      const result = await ingestRecord({
        principalId: principalId.trim(),
        displayName: displayName ? String(displayName).slice(0, 80) : undefined,
        purpose,
        rawText,
        useGeminiHybrid: Boolean(useGeminiHybrid),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Ingest failed',
      });
    }
  });

  app.post('/api/rag/query', aiHeavyLimiter, async (req, res) => {
    try {
      const { query, agentRole, requestedPurpose, principalIdFilter } = req.body as {
        query?: string;
        agentRole?: string;
        requestedPurpose?: ConsentPurpose;
        principalIdFilter?: string;
      };
      if (!query || typeof query !== 'string' || !query.trim() || query.length > 2000) {
        res.status(400).json({ error: 'query must be 1-2,000 characters.' });
        return;
      }
      if (!agentRole || !requestedPurpose || !VALID_PURPOSES.has(requestedPurpose)) {
        res.status(400).json({ error: 'agentRole and valid requestedPurpose are required.' });
        return;
      }
      if (principalIdFilter && !PRINCIPAL_ID_REGEX.test(principalIdFilter)) {
        res.status(400).json({ error: 'Invalid principalIdFilter format.' });
        return;
      }
      const result = await queryPurposeScopedRag({
        query,
        agentRole: String(agentRole).slice(0, 80),
        requestedPurpose,
        principalIdFilter: principalIdFilter || undefined,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'RAG query failed',
      });
    }
  });

  app.post('/api/consent/revoke', standardLimiter, optionalBearerAuth, (req, res) => {
    try {
      const { principalId } = req.body as { principalId?: string };
      if (!principalId || !PRINCIPAL_ID_REGEX.test(principalId)) {
        res.status(400).json({ error: 'Valid principalId is required.' });
        return;
      }
      const certificate = revokeAndCryptoShred(principalId);
      res.json({ certificate });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Crypto-shredding failed',
      });
    }
  });

  app.post('/api/vault/reset', standardLimiter, optionalBearerAuth, (_req, res) => {
    resetVaultDatabase();
    res.json({ principals: listPrincipals(), auditLog: getAuditLog() });
  });

  app.get('/api/audit', (_req, res) => {
    const entries = getAuditLog();
    const verification = verifyAuditChain(entries);
    res.json({ entries, verification });
  });

  app.post('/api/audit/simulate-tamper', standardLimiter, (_req, res) => {
    const entries = getAuditLog();
    if (entries.length === 0) {
      res.status(400).json({ error: 'Audit ledger is empty.' });
      return;
    }
    const targetIdx = Math.min(1, entries.length - 1);
    const cloned = structuredClone(entries);
    cloned[targetIdx].details = `${cloned[targetIdx].details} [TAMPERED]`;
    const verification = verifyAuditChain(cloned);
    res.json({
      mutatedIndex: targetIdx,
      verification,
      originalHash: entries[targetIdx].entryHash,
    });
  });

  app.get('/api/eval/run', (_req, res) => {
    const report = runGoldenEvalBenchmark();
    res.json(report);
  });

  app.post('/api/mcp', standardLimiter, optionalBearerAuth, async (req, res) => {
    try {
      const rpc = req.body as McpJsonRpcRequest;
      if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request.' },
        });
        return;
      }
      const response = await handleMcpJsonRpc(rpc);
      if (response === null) {
        res.status(204).end();
        return;
      }
      res.json(response);
    } catch (err) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: err instanceof Error ? err.message : 'Invalid JSON-RPC payload',
        },
      });
    }
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`DPDP-Vault server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start DPDP-Vault server:', err);
  process.exit(1);
});
