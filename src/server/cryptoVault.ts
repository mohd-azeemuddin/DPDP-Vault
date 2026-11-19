import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AuditEntry } from '../shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MASTER_KEY_PATH = path.join(DATA_DIR, '.master.key');

let cachedMasterKey: Buffer | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;
  const envHex = process.env.VAULT_MASTER_KEY?.trim();
  if (envHex && /^[0-9a-fA-F]{64}$/.test(envHex)) {
    cachedMasterKey = Buffer.from(envHex, 'hex');
    return cachedMasterKey;
  }

  ensureDataDir();
  if (fs.existsSync(MASTER_KEY_PATH)) {
    const fileHex = fs.readFileSync(MASTER_KEY_PATH, 'utf8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(fileHex)) {
      cachedMasterKey = Buffer.from(fileHex, 'hex');
      return cachedMasterKey;
    }
  }

  const generated = crypto.randomBytes(32);
  fs.writeFileSync(MASTER_KEY_PATH, generated.toString('hex'), { mode: 0o600 });
  cachedMasterKey = generated;
  return cachedMasterKey;
}

export interface WrappedDek {
  wrappedB64: string;
  ivB64: string;
  tagB64: string;
  fingerprint: string;
}

export function generateAndWrapDek(): WrappedDek {
  const dek = crypto.randomBytes(32);
  const kek = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  const fingerprint = crypto.createHash('sha256').update(dek).digest('hex').slice(0, 16);
  dek.fill(0);

  return {
    wrappedB64: wrapped.toString('base64'),
    ivB64: iv.toString('base64'),
    tagB64: tag.toString('base64'),
    fingerprint,
  };
}

export function unwrapDek(wrapped: WrappedDek): Buffer {
  const kek = getMasterKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    kek,
    Buffer.from(wrapped.ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(wrapped.tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(wrapped.wrappedB64, 'base64')),
    decipher.final(),
  ]);
}

export interface EncryptedPayload {
  ciphertextB64: string;
  ivB64: string;
  tagB64: string;
}

export function encryptWithDek(plaintext: string, wrappedDek: WrappedDek): EncryptedPayload {
  const dek = unwrapDek(wrappedDek);
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertextB64: ciphertext.toString('base64'),
      ivB64: iv.toString('base64'),
      tagB64: tag.toString('base64'),
    };
  } finally {
    dek.fill(0);
  }
}

export function decryptWithDek(payload: EncryptedPayload, wrappedDek: WrappedDek): string {
  const dek = unwrapDek(wrappedDek);
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(payload.ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertextB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } finally {
    dek.fill(0);
  }
}

export function computeAuditHash(params: {
  index: number;
  timestamp: string;
  event: AuditEntry['event'];
  principalId: string;
  details: string;
  prevHash: string;
}): string {
  const canonical = `${params.index}|${params.timestamp}|${params.event}|${params.principalId}|${params.details}|${params.prevHash}`;
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function verifyAuditChain(entries: AuditEntry[]): {
  valid: boolean;
  brokenAtIndex: number | null;
} {
  let expectedPrev = '0'.repeat(64);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.index !== i || entry.prevHash !== expectedPrev) {
      return { valid: false, brokenAtIndex: i };
    }
    const recomputed = computeAuditHash({
      index: entry.index,
      timestamp: entry.timestamp,
      event: entry.event,
      principalId: entry.principalId,
      details: entry.details,
      prevHash: entry.prevHash,
    });
    if (recomputed !== entry.entryHash) {
      return { valid: false, brokenAtIndex: i };
    }
    expectedPrev = entry.entryHash;
  }
  return { valid: true, brokenAtIndex: null };
}
