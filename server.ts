import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { verifyAuditChain } from './src/server/cryptoVault.ts';
import { runGoldenEvalBenchmark } from './src/server/evalSuite.ts';
import { analyzeWithFirewall } from './src/server/firewallService.ts';
import { detectImagePiiBoxes, hasGeminiKey } from './src/server/geminiClient.ts';
import { handleMcpJsonRpc, type McpJsonRpcRequest } from './src/server/mcpHandler.ts';
import {
  getAuditLog,
  ingestRecord,
  listPrincipals,
  queryPurposeScopedRag,
  resetVaultDatabase,
  revokeAndCryptoShred,
  updatePrincipalPurposes,
} from './src/server/ragStore.ts';
import type { ConsentPurpose } from './src/shared/types.ts';

async function startServer(): Promise<void> {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      geminiConfigured: hasGeminiKey(),
      nodeVersion: process.version,
    });
  });

  app.post('/api/firewall/analyze', async (req, res) => {
    try {
      const { text, useGeminiHybrid } = req.body as {
        text?: string;
        useGeminiHybrid?: boolean;
      };
      if (!text || typeof text !== 'string') {
        res.status(400).json({ error: 'Request body must include non-empty "text".' });
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

  app.post('/api/firewall/redact-image', async (req, res) => {
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
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
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

  app.patch('/api/principals/:principalId/purposes', (req, res) => {
    try {
      const { principalId } = req.params;
      const { allowedPurposes } = req.body as { allowedPurposes?: ConsentPurpose[] };
      if (!Array.isArray(allowedPurposes)) {
        res.status(400).json({ error: 'allowedPurposes array is required.' });
        return;
      }
      const updated = updatePrincipalPurposes(principalId, allowedPurposes);
      res.json({ principal: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update purposes',
      });
    }
  });

  app.post('/api/rag/ingest', async (req, res) => {
    try {
      const { principalId, displayName, purpose, rawText, useGeminiHybrid } = req.body as {
        principalId?: string;
        displayName?: string;
        purpose?: ConsentPurpose;
        rawText?: string;
        useGeminiHybrid?: boolean;
      };
      if (!principalId || !purpose || !rawText) {
        res.status(400).json({ error: 'principalId, purpose, and rawText are required.' });
        return;
      }
      const result = await ingestRecord({
        principalId: principalId.trim(),
        displayName,
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

  app.post('/api/rag/query', async (req, res) => {
    try {
      const { query, agentRole, requestedPurpose, principalIdFilter } = req.body as {
        query?: string;
        agentRole?: string;
        requestedPurpose?: ConsentPurpose;
        principalIdFilter?: string;
      };
      if (!query || !agentRole || !requestedPurpose) {
        res.status(400).json({ error: 'query, agentRole, and requestedPurpose are required.' });
        return;
      }
      const result = await queryPurposeScopedRag({
        query,
        agentRole,
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

  app.post('/api/consent/revoke', (req, res) => {
    try {
      const { principalId } = req.body as { principalId?: string };
      if (!principalId) {
        res.status(400).json({ error: 'principalId is required.' });
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

  app.post('/api/vault/reset', (_req, res) => {
    resetVaultDatabase();
    res.json({ principals: listPrincipals(), auditLog: getAuditLog() });
  });

  app.get('/api/audit', (_req, res) => {
    const entries = getAuditLog();
    const verification = verifyAuditChain(entries);
    res.json({ entries, verification });
  });

  app.get('/api/eval/run', (_req, res) => {
    const report = runGoldenEvalBenchmark();
    res.json(report);
  });

  app.post('/api/mcp', async (req, res) => {
    try {
      const rpc = req.body as McpJsonRpcRequest;
      const response = await handleMcpJsonRpc(rpc);
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
