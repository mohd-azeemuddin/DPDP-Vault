import type { ConsentPurpose } from '../shared/types.ts';
import { verifyAuditChain } from './cryptoVault.ts';
import { analyzeWithFirewall } from './firewallService.ts';
import {
  getAuditLog,
  ingestRecord,
  queryPurposeScopedRag,
  revokeAndCryptoShred,
} from './ragStore.ts';

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const VALID_PURPOSES = new Set<ConsentPurpose>([
  'kyc_verification',
  'support_chat',
  'loan_underwriting',
  'marketing',
]);

const PRINCIPAL_ID_REGEX = /^[a-zA-Z0-9_-]{3,48}$/;

function assertPurpose(val: unknown, fallback: ConsentPurpose): ConsentPurpose {
  if (typeof val === 'string' && VALID_PURPOSES.has(val as ConsentPurpose)) {
    return val as ConsentPurpose;
  }
  if (val === undefined) return fallback;
  throw new Error(
    `Invalid DPDP purpose "${String(val)}". Allowed: kyc_verification, support_chat, loan_underwriting, marketing.`,
  );
}

function assertPrincipalId(val: unknown): string {
  const id = String(val ?? '').trim();
  if (!PRINCIPAL_ID_REGEX.test(id)) {
    throw new Error('principalId must be 3-48 alphanumeric, underscore, or hyphen characters.');
  }
  return id;
}

const MCP_TOOLS = [
  {
    name: 'dpdp_redact_text',
    description:
      'Scrub Indian PII (Aadhaar w/ Verhoeff checksum, PAN, GSTIN, IFSC, UPI VPA, Hinglish names/phones) into reversible tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Raw Hinglish/English input text (max 20,000 chars)' },
        useGeminiHybrid: { type: 'boolean', default: false },
      },
      required: ['text'],
    },
  },
  {
    name: 'dpdp_safe_ingest',
    description:
      'Redact PII, encrypt chunk with Data Principal AES-256-GCM DEK, and store under a strict DPDP purpose scope.',
    inputSchema: {
      type: 'object',
      properties: {
        principalId: { type: 'string' },
        purpose: {
          type: 'string',
          enum: ['kyc_verification', 'support_chat', 'loan_underwriting', 'marketing'],
        },
        rawText: { type: 'string' },
      },
      required: ['principalId', 'purpose', 'rawText'],
    },
  },
  {
    name: 'dpdp_purpose_retrieve',
    description:
      'Retrieve encrypted records ONLY if Data Principal consent is ACTIVE and allowedPurposes matches the agent purpose.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        agentRole: { type: 'string' },
        requestedPurpose: {
          type: 'string',
          enum: ['kyc_verification', 'support_chat', 'loan_underwriting', 'marketing'],
        },
        principalIdFilter: { type: 'string' },
      },
      required: ['query', 'agentRole', 'requestedPurpose'],
    },
  },
  {
    name: 'dpdp_crypto_shred',
    description:
      'Execute DPDP Section 12 Right to Erasure: destroy principal DEK, purge vectors, run 5-vector canary audit, and issue certificate.',
    inputSchema: {
      type: 'object',
      properties: {
        principalId: { type: 'string' },
      },
      required: ['principalId'],
    },
  },
  {
    name: 'dpdp_audit_verify',
    description:
      'Verify integrity of the SHA-256 hash-chained DPDP compliance audit ledger.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleMcpJsonRpc(
  req: McpJsonRpcRequest,
): Promise<Record<string, unknown> | null> {
  const id = req.id ?? null;

  // MCP lifecycle notifications carry no id and expect no JSON-RPC response frame
  if (req.method === 'notifications/initialized' || req.method === 'notifications/cancelled') {
    return null;
  }

  if (req.method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-03-26',
        serverInfo: {
          name: 'dpdp-vault-mcp',
          version: '1.0.0',
        },
        capabilities: {
          tools: {},
        },
      },
    };
  }

  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  if (req.method === 'tools/call') {
    const params = req.params ?? {};
    const toolName = String(params.name ?? '');
    const args = (params.arguments ?? {}) as Record<string, unknown>;

    try {
      let toolPayload: unknown;
      if (toolName === 'dpdp_redact_text') {
        const text = String(args.text ?? '');
        if (!text.trim() || text.length > 20000) {
          throw new Error('text must be between 1 and 20,000 characters.');
        }
        toolPayload = await analyzeWithFirewall({
          text,
          useGeminiHybrid: Boolean(args.useGeminiHybrid ?? false),
        });
      } else if (toolName === 'dpdp_safe_ingest') {
        const rawText = String(args.rawText ?? '');
        if (!rawText.trim() || rawText.length > 20000) {
          throw new Error('rawText must be between 1 and 20,000 characters.');
        }
        toolPayload = await ingestRecord({
          principalId: assertPrincipalId(args.principalId ?? 'usr_mcp_01'),
          purpose: assertPurpose(args.purpose, 'support_chat'),
          rawText,
          useGeminiHybrid: false,
        });
      } else if (toolName === 'dpdp_purpose_retrieve') {
        const query = String(args.query ?? '');
        if (!query.trim() || query.length > 2000) {
          throw new Error('query must be between 1 and 2,000 characters.');
        }
        toolPayload = await queryPurposeScopedRag({
          query,
          agentRole: String(args.agentRole ?? 'mcp_agent').slice(0, 80),
          requestedPurpose: assertPurpose(args.requestedPurpose, 'support_chat'),
          principalIdFilter: args.principalIdFilter
            ? assertPrincipalId(args.principalIdFilter)
            : undefined,
        });
      } else if (toolName === 'dpdp_crypto_shred') {
        toolPayload = revokeAndCryptoShred(assertPrincipalId(args.principalId));
      } else if (toolName === 'dpdp_audit_verify') {
        const entries = getAuditLog();
        const verification = verifyAuditChain(entries);
        toolPayload = {
          totalEntries: entries.length,
          verification,
          latestHash: entries.at(-1)?.entryHash ?? null,
        };
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Unknown MCP tool: ${toolName}` },
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(toolPayload, null, 2),
            },
          ],
        },
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: err instanceof Error ? err.message : 'MCP tool execution failed',
        },
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${req.method}` },
  };
}
