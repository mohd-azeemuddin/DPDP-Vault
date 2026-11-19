import type { ConsentPurpose } from '../shared/types.ts';
import { analyzeWithFirewall } from './firewallService.ts';
import { ingestRecord, queryPurposeScopedRag, revokeAndCryptoShred } from './ragStore.ts';

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const MCP_TOOLS = [
  {
    name: 'dpdp_redact_text',
    description:
      'Scrub Indian PII (Aadhaar w/ Verhoeff checksum, PAN, GSTIN, IFSC, UPI VPA, Hinglish names/phones) into reversible tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Raw Hinglish/English input text' },
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
];

export async function handleMcpJsonRpc(req: McpJsonRpcRequest): Promise<Record<string, unknown>> {
  const id = req.id ?? null;

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
        toolPayload = await analyzeWithFirewall({
          text: String(args.text ?? ''),
          useGeminiHybrid: Boolean(args.useGeminiHybrid ?? false),
        });
      } else if (toolName === 'dpdp_safe_ingest') {
        toolPayload = await ingestRecord({
          principalId: String(args.principalId ?? 'usr_mcp_01'),
          purpose: (args.purpose as ConsentPurpose) ?? 'support_chat',
          rawText: String(args.rawText ?? ''),
          useGeminiHybrid: false,
        });
      } else if (toolName === 'dpdp_purpose_retrieve') {
        toolPayload = await queryPurposeScopedRag({
          query: String(args.query ?? ''),
          agentRole: String(args.agentRole ?? 'mcp_agent'),
          requestedPurpose: (args.requestedPurpose as ConsentPurpose) ?? 'support_chat',
          principalIdFilter: args.principalIdFilter ? String(args.principalIdFilter) : undefined,
        });
      } else if (toolName === 'dpdp_crypto_shred') {
        toolPayload = revokeAndCryptoShred(String(args.principalId ?? ''));
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
