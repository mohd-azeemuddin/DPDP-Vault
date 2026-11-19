import type { DetectedEntity, PiiEntityType } from '../shared/types.ts';

// Verhoeff dihedral multiplication, permutation, and inverse tables
// Used by UIDAI to validate genuine 12-digit Indian Aadhaar numbers.
const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function isValidAadhaarVerhoeff(rawDigits: string): boolean {
  const digits = rawDigits.replace(/[\s-]/g, '');
  if (!/^[2-9][0-9]{11}$/.test(digits)) {
    return false;
  }
  let c = 0;
  const reversed = digits.split('').reverse();
  for (let i = 0; i < reversed.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(reversed[i])]];
  }
  return c === 0;
}

const VALID_PAN_ENTITY_CODES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

export function isValidPan(pan: string): boolean {
  const normalized = pan.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalized)) {
    return false;
  }
  return VALID_PAN_ENTITY_CODES.has(normalized[3]);
}

export function isValidGstin(gstin: string): boolean {
  const normalized = gstin.trim().toUpperCase();
  if (!/^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(normalized)) {
    return false;
  }
  const stateCode = Number(normalized.slice(0, 2));
  return stateCode >= 1 && stateCode <= 38;
}

const KNOWN_UPI_HANDLES = new Set([
  'okaxis', 'okhdfcbank', 'okicici', 'oksbi', 'ybl', 'ibl', 'axl', 'paytm',
  'pthdfc', 'ptsbi', 'ptaxis', 'ptyes', 'upi', 'apl', 'yapl', 'rapl', 'icici',
  'hdfcbank', 'sbi', 'axisbank', 'kotak', 'indus', 'federal', 'jupiteraxis',
  'sliceaxis', 'cred', 'fam', 'waaxis', 'wahdfcbank', 'waicici', 'wasbi', 'airtel',
  'jio', 'postbank', 'barodampay', 'cnrb', 'mahb', 'pnb', 'uboi', 'unionbank',
]);

export function isLikelyUpiId(handle: string): boolean {
  const parts = handle.toLowerCase().split('@');
  if (parts.length !== 2) return false;
  const [user, psp] = parts;
  if (!/^[a-z0-9._-]{2,64}$/.test(user)) return false;
  if (psp.includes('.')) return false; // Distinguish emails (gmail.com) from UPI VPAs (@okaxis)
  return KNOWN_UPI_HANDLES.has(psp) || /^[a-z]{3,16}(bank|upi|pay)$/.test(psp);
}

interface RawMatch {
  type: PiiEntityType;
  value: string;
  start: number;
  end: number;
  confidence: number;
  method: DetectedEntity['method'];
  note?: string;
}

/**
 * Simulates a naive English-centric Regex/Presidio baseline:
 * - Flags ANY 12-digit number as Aadhaar (high false positives on order/ref numbers)
 * - Misses Hinglish spoken/contextual cues & many UPI PSP handles
 * - Misses Hinglish-prefixed names/addresses
 */
export function runNaiveBaseline(text: string): Array<{
  type: string;
  value: string;
  start: number;
  end: number;
}> {
  const matches: Array<{ type: string; value: string; start: number; end: number }> = [];
  const patterns: Array<{ type: string; regex: RegExp }> = [
    { type: 'AADHAAR_NAIVE', regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g },
    { type: 'PAN', regex: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
    { type: 'PHONE_IN', regex: /\+91[\s-]?\d{10}\b/g },
    { type: 'EMAIL', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  ];

  for (const { type, regex } of patterns) {
    for (const m of text.matchAll(regex)) {
      if (m.index !== undefined) {
        matches.push({
          type,
          value: m[0],
          start: m.index,
          end: m.index + m[0].length,
        });
      }
    }
  }
  return resolveOverlapsGeneric(matches);
}

/**
 * DPDP-Vault Deterministic + Hinglish Context Detector (runs offline on CPU in <5ms)
 */
export function detectDeterministicIndianPii(text: string): RawMatch[] {
  const candidates: RawMatch[] = [];

  // 1. Aadhaar with strict Verhoeff checksum validation + order/invoice trap guard
  const aadhaarRegex = /\b[2-9][0-9]{3}[\s-]?[0-9]{4}[\s-]?[0-9]{4}\b/g;
  for (const m of text.matchAll(aadhaarRegex)) {
    if (m.index === undefined) continue;
    const prefixWindow = text.slice(Math.max(0, m.index - 22), m.index);
    const isTrapPrefix = /\b(order|invoice|inv|ref|utr|tracking|ticket)\b/i.test(prefixWindow);
    const hasAadhaarCue = /\b(aadhaar|aadhar|uid|uidai|kyc)\b/i.test(prefixWindow);
    if (isTrapPrefix && !hasAadhaarCue) continue;
    if (isValidAadhaarVerhoeff(m[0])) {
      candidates.push({
        type: 'AADHAAR',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.99,
        method: 'verhoeff_checksum',
        note: 'Passed UIDAI Verhoeff checksum + context check',
      });
    }
  }

  // 2. GSTIN (check before PAN because GSTIN contains a 10-char PAN substring!)
  const gstinRegex = /\b[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/gi;
  for (const m of text.matchAll(gstinRegex)) {
    if (m.index === undefined) continue;
    if (isValidGstin(m[0])) {
      candidates.push({
        type: 'GSTIN',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.98,
        method: 'indian_pattern',
        note: 'Valid 15-char Indian GSTIN',
      });
    }
  }

  // 3. PAN Card
  const panRegex = /\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/g;
  for (const m of text.matchAll(panRegex)) {
    if (m.index === undefined) continue;
    if (isValidPan(m[0])) {
      candidates.push({
        type: 'PAN',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.97,
        method: 'indian_pattern',
        note: 'Validated 4th-char PAN entity code',
      });
    }
  }

  // 4. IFSC Code
  const ifscRegex = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
  for (const m of text.matchAll(ifscRegex)) {
    if (m.index === undefined) continue;
    candidates.push({
      type: 'IFSC',
      value: m[0],
      start: m.index,
      end: m.index + m[0].length,
      confidence: 0.95,
      method: 'indian_pattern',
      note: 'RBI 11-char IFSC routing code',
    });
  }

  // 5. Email
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  for (const m of text.matchAll(emailRegex)) {
    if (m.index === undefined) continue;
    candidates.push({
      type: 'EMAIL',
      value: m[0],
      start: m.index,
      end: m.index + m[0].length,
      confidence: 0.98,
      method: 'indian_pattern',
    });
  }

  // 6. UPI VPA (e.g. rahul98@okaxis, 9820112233@ybl, gpay: ramesh@oksbi)
  const upiRegex = /\b[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,20}\b/g;
  for (const m of text.matchAll(upiRegex)) {
    if (m.index === undefined) continue;
    if (isLikelyUpiId(m[0])) {
      candidates.push({
        type: 'UPI_ID',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: 0.96,
        method: 'indian_pattern',
        note: 'Matched NPCI UPI PSP handle',
      });
    }
  }

  // 7. Indian Mobile Numbers (handles +91, 0-prefix, spaces/dashes, or bare 10-digit starting 6-9 with Hinglish context)
  const phoneWithPrefixRegex = /(?:\+91[\s-]?|(?:\b0))([6-9][0-9]{4}[\s-]?[0-9]{5})\b/g;
  for (const m of text.matchAll(phoneWithPrefixRegex)) {
    if (m.index === undefined) continue;
    candidates.push({
      type: 'PHONE_IN',
      value: m[0],
      start: m.index,
      end: m.index + m[0].length,
      confidence: 0.97,
      method: 'indian_pattern',
    });
  }

  // Bare 10-digit Indian mobile numbers (e.g., "mera no 9820112233 hai" or "gpay 9811223344 pe bhejo")
  const barePhoneRegex = /\b([6-9][0-9]{9})\b/g;
  const phoneContextWords = /\b(phone|mob|mobile|whatsapp|wp|wa|call|number|no|num|gpay|phonepe|paytm|bhejo|contact|sampark|mera|meri|uska)\b/i;
  for (const m of text.matchAll(barePhoneRegex)) {
    if (m.index === undefined) continue;
    const windowStart = Math.max(0, m.index - 40);
    const windowEnd = Math.min(text.length, m.index + m[0].length + 25);
    const surrounding = text.slice(windowStart, windowEnd);
    const isOrderTrap = /\b(order|invoice|inv|ref|txn|utr|tracking|ticket|pin)\b/i.test(
      text.slice(Math.max(0, m.index - 18), m.index),
    );
    if (!isOrderTrap && (phoneContextWords.test(surrounding) || m[0].startsWith('9') || m[0].startsWith('8') || m[0].startsWith('7'))) {
      candidates.push({
        type: 'PHONE_IN',
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: phoneContextWords.test(surrounding) ? 0.94 : 0.84,
        method: 'hinglish_context',
        note: phoneContextWords.test(surrounding)
          ? 'Hinglish phone/UPI context cue'
          : '10-digit Indian mobile range [6-9]',
      });
    }
  }

  // 8. Hinglish / English Name cues ("Mera naam Rahul Sharma hai", "Name: Priya Nair")
  const hinglishNamePatterns = [
    /\b(?:mera naam|my name is|name\s*[:\-]|customer\s*[:\-]|applicant\s*[:\-]|naam\s*[:\-]?)\s+([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){0,2})/gi,
  ];
  for (const regex of hinglishNamePatterns) {
    for (const m of text.matchAll(regex)) {
      if (m.index === undefined || !m[1]) continue;
      const val = m[1].replace(/\s+(hai|hoon|hu|ji)$/i, '').trim();
      if (val.length < 2) continue;
      const valStart = text.indexOf(val, m.index);
      if (valStart !== -1) {
        candidates.push({
          type: 'PERSON_NAME',
          value: val,
          start: valStart,
          end: valStart + val.length,
          confidence: 0.89,
          method: 'hinglish_context',
          note: 'Hinglish intro cue',
        });
      }
    }
  }

  // 9. Indian Address / PIN cues ("pata: Flat 402 Indiranagar Bengaluru 560038", "address ...")
  const addressRegex =
    /\b(?:address|pata|rehta hoon|stays at|deliver to)\s*[:\-]?\s*([A-Za-z0-9,.\s/-]{10,80}\b[1-8][0-9]{5}\b)/gi;
  for (const m of text.matchAll(addressRegex)) {
    if (m.index === undefined || !m[1]) continue;
    const val = m[1].trim();
    const valStart = text.indexOf(val, m.index);
    if (valStart !== -1) {
      candidates.push({
        type: 'ADDRESS',
        value: val,
        start: valStart,
        end: valStart + val.length,
        confidence: 0.88,
        method: 'hinglish_context',
        note: 'Indian PIN + address cue',
      });
    }
  }

  return resolveOverlaps(candidates);
}

function resolveOverlapsGeneric<T extends { start: number; end: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const accepted: T[] = [];
  for (const item of sorted) {
    const overlaps = accepted.some((acc) => !(item.end <= acc.start || item.start >= acc.end));
    if (!overlaps) {
      accepted.push(item);
    }
  }
  return accepted;
}

export function resolveOverlaps(items: RawMatch[]): RawMatch[] {
  const priority: Record<PiiEntityType, number> = {
    GSTIN: 10,
    AADHAAR: 9,
    PAN: 8,
    UPI_ID: 7,
    IFSC: 6,
    EMAIL: 5,
    PHONE_IN: 4,
    ADDRESS: 3,
    PERSON_NAME: 2,
  };
  const sorted = [...items].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenDiff = b.end - b.start - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return priority[b.type] - priority[a.type];
  });
  const accepted: RawMatch[] = [];
  for (const item of sorted) {
    const overlaps = accepted.some((acc) => !(item.end <= acc.start || item.start >= acc.end));
    if (!overlaps) {
      accepted.push(item);
    }
  }
  return accepted;
}

export function tokenizeRedactions(
  text: string,
  matches: RawMatch[],
): {
  redactedText: string;
  entities: DetectedEntity[];
  tokenVault: Record<string, string>;
} {
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  const counters: Partial<Record<PiiEntityType, number>> = {};
  const valueToToken = new Map<string, string>();
  const tokenVault: Record<string, string> = {};
  const entities: DetectedEntity[] = [];

  let cursor = 0;
  let output = '';

  for (const match of sorted) {
    if (match.start < cursor) continue;
    const key = `${match.type}:${match.value}`;
    let token = valueToToken.get(key);
    if (!token) {
      const nextCount = (counters[match.type] ?? 0) + 1;
      counters[match.type] = nextCount;
      token = `<${match.type}_${nextCount}>`;
      valueToToken.set(key, token);
      tokenVault[token] = match.value;
    }

    output += text.slice(cursor, match.start) + token;
    cursor = match.end;
    entities.push({
      ...match,
      token,
    });
  }
  output += text.slice(cursor);

  return { redactedText: output, entities, tokenVault };
}

export function applyNaiveRedactions(
  text: string,
  matches: Array<{ type: string; value: string; start: number; end: number }>,
): string {
  const sorted = [...matches].sort((a, b) => a.start - b.start);
  let cursor = 0;
  let out = '';
  for (const m of sorted) {
    if (m.start < cursor) continue;
    out += text.slice(cursor, m.start) + `<${m.type}>`;
    cursor = m.end;
  }
  out += text.slice(cursor);
  return out;
}
