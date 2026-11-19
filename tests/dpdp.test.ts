import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeAuditHash,
  decryptWithDek,
  encryptWithDek,
  generateAndWrapDek,
  verifyAuditChain,
} from '../src/server/cryptoVault.ts';
import { runGoldenEvalBenchmark } from '../src/server/evalSuite.ts';
import { handleMcpJsonRpc } from '../src/server/mcpHandler.ts';
import {
  queryPurposeScopedRag,
  resetVaultDatabase,
  revokeAndCryptoShred,
} from '../src/server/ragStore.ts';
import {
  detectDeterministicIndianPii,
  isLikelyUpiId,
  isValidAadhaarVerhoeff,
  isValidGstin,
  isValidPan,
} from '../src/server/validators.ts';
import type { AuditEntry } from '../src/shared/types.ts';

test('UIDAI Verhoeff checksum validates real Aadhaar and rejects random 12-digit IDs', () => {
  assert.equal(isValidAadhaarVerhoeff('4991 1866 5246'), true);
  assert.equal(isValidAadhaarVerhoeff('3425 7718 9045'), true);
  assert.equal(isValidAadhaarVerhoeff('4829 1920 3812'), false);
  assert.equal(isValidAadhaarVerhoeff('1234 5678 9012'), false);
});

test('Indian PAN, GSTIN, and UPI VPA validators distinguish emails vs UPI handles', () => {
  assert.equal(isValidPan('ABCPE1234F'), true);
  assert.equal(isValidPan('ABCDE1234F'), false); // 'D' is not a valid PAN 4th-char entity code
  assert.equal(isValidGstin('29AABCU9603R1ZM'), true);
  assert.equal(isLikelyUpiId('aarav98@okaxis'), true);
  assert.equal(isLikelyUpiId('ankit@gmail.com'), false);
});

test('Hinglish firewall catches spaced Indian mobiles and avoids order-ID Verhoeff traps', () => {
  const text =
    'Order ID 554433221100 pending hai. Mera phone 98201 12233 aur UPI shop@ybl pe bhejo.';
  const matches = detectDeterministicIndianPii(text);
  const values = matches.map((m) => m.value);
  assert.equal(values.includes('554433221100'), false);
  assert.equal(values.includes('98201 12233'), true);
  assert.equal(values.includes('shop@ybl'), true);
});

test('AES-256-GCM DEK encryption fails authentication when decrypted with a different key', () => {
  const dekA = generateAndWrapDek();
  const dekB = generateAndWrapDek();
  const encrypted = encryptWithDek('Confidential KYC payload <AADHAAR_1>', dekA);

  assert.equal(decryptWithDek(encrypted, dekA), 'Confidential KYC payload <AADHAAR_1>');
  assert.throws(() => decryptWithDek(encrypted, dekB));
});

test('SHA-256 audit chain detects single-character tampering', () => {
  const prev = '0'.repeat(64);
  const ts = '2026-11-19T00:00:00.000Z';
  const h0 = computeAuditHash({
    index: 0,
    timestamp: ts,
    event: 'CONSENT_GRANTED',
    principalId: 'usr_1',
    details: 'Initial consent',
    prevHash: prev,
  });
  const h1 = computeAuditHash({
    index: 1,
    timestamp: ts,
    event: 'CHUNK_INGESTED',
    principalId: 'usr_1',
    details: 'Chunk ingested',
    prevHash: h0,
  });

  const entries: AuditEntry[] = [
    {
      index: 0,
      timestamp: ts,
      event: 'CONSENT_GRANTED',
      principalId: 'usr_1',
      details: 'Initial consent',
      prevHash: prev,
      entryHash: h0,
    },
    {
      index: 1,
      timestamp: ts,
      event: 'CHUNK_INGESTED',
      principalId: 'usr_1',
      details: 'Chunk ingested',
      prevHash: h0,
      entryHash: h1,
    },
  ];

  assert.deepEqual(verifyAuditChain(entries), { valid: true, brokenAtIndex: null });

  const tampered = structuredClone(entries);
  tampered[0].details = 'Modified consent';
  assert.deepEqual(verifyAuditChain(tampered), { valid: false, brokenAtIndex: 0 });
});

test('Purpose gate blocks marketing queries and Section 12 crypto-shredding yields 0% leakage', async () => {
  resetVaultDatabase();

  const blocked = await queryPurposeScopedRag({
    query: 'Get customer Aadhaar and UPI',
    agentRole: 'Marketing Bot',
    requestedPurpose: 'marketing',
  });
  assert.equal(blocked.retrievedChunks.length, 0);
  assert.ok(blocked.blockedCount > 0);

  const cert = revokeAndCryptoShred('usr_vikram_03');
  assert.equal(cert.dekDestroyed, true);
  assert.equal(cert.canarySummary.verified, true);
  assert.equal(cert.canarySummary.leakageRatePercent, 0);

  resetVaultDatabase();
});

test('Golden evaluation suite achieves >= 95% F1 and 0 false-positive trap failures', () => {
  const report = runGoldenEvalBenchmark();
  assert.ok(report.dpdpVault.f1 >= 95);
  assert.equal(report.dpdpVault.falsePositiveTrapsFailed, 0);
});

test('MCP JSON-RPC 2.0 endpoint lists tools and executes dpdp_redact_text', async () => {
  const listRes = (await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  })) as { result: { tools: Array<{ name: string }> } };
  assert.equal(listRes.result.tools.length, 4);

  const callRes = (await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'dpdp_redact_text',
      arguments: { text: 'Mera PAN ABCPE1234F hai', useGeminiHybrid: false },
    },
  })) as { result: { content: Array<{ text: string }> } };
  const parsed = JSON.parse(callRes.result.content[0].text) as { redactedText: string };
  assert.ok(parsed.redactedText.includes('<PAN_1>'));
});
