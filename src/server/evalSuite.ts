import type { EvalBenchmarkReport, EvalCaseResult } from '../shared/types.ts';
import { detectDeterministicIndianPii, runNaiveBaseline } from './validators.ts';

interface GoldenEvalCase {
  id: string;
  category: EvalCaseResult['category'];
  input: string;
  expectedValues: string[];
  notes: string;
}

// 20 curated Indian Hinglish, Verhoeff trap, and UPI edge cases
// Notice: Aadhaar numbers in positive cases pass real UIDAI Verhoeff checksums;
// trap cases are 12-digit invoice/order numbers that FAIL Verhoeff!
const GOLDEN_EVAL_CASES: GoldenEvalCase[] = [
  {
    id: 'eval_01',
    category: 'verhoeff_trap',
    input: 'Sir order ID 1234 5678 9012 ka refund kab aayega?',
    expectedValues: [],
    notes: '12-digit order ID starts with 1 and fails Verhoeff; naive regex falsely flags it as Aadhaar.',
  },
  {
    id: 'eval_02',
    category: 'verhoeff_trap',
    input: 'Invoice number 4829 1920 3812 verify karo please.',
    expectedValues: [],
    notes: '12-digit invoice starting with 4 that fails Verhoeff checksum.',
  },
  {
    id: 'eval_03',
    category: 'kyc_mixed',
    input: 'Mera Aadhaar 4991 1866 5246 hai, verify karke batao.',
    expectedValues: ['4991 1866 5246'],
    notes: 'Valid UIDAI Verhoeff Aadhaar inside Hinglish sentence.',
  },
  {
    id: 'eval_04',
    category: 'hinglish_chat',
    input: 'Bhai mera no 9820112233 hai aur gpay rahul.sharma@okaxis pe bhej do.',
    expectedValues: ['9820112233', 'rahul.sharma@okaxis'],
    notes: 'Bare 10-digit Indian phone + NPCI UPI handle.',
  },
  {
    id: 'eval_05',
    category: 'obfuscated_upi',
    input: 'Payment kar diya 9811223344@ybl pe, check karo.',
    expectedValues: ['9811223344@ybl'],
    notes: 'PhonePe UPI handle (@ybl) missed by email-only regexes.',
  },
  {
    id: 'eval_06',
    category: 'kyc_mixed',
    input: 'PAN card ABCPE1234F aur IFSC HDFC0000240 attach kar diya hai.',
    expectedValues: ['ABCPE1234F', 'HDFC0000240'],
    notes: 'PAN + IFSC inside Hinglish text.',
  },
  {
    id: 'eval_07',
    category: 'kyc_mixed',
    input: 'Company GSTIN 29AABCU9603R1ZM hai aur email finance@kiranaops.in pe mail karo.',
    expectedValues: ['29AABCU9603R1ZM', 'finance@kiranaops.in'],
    notes: 'GSTIN contains a PAN substring—should emit single GSTIN token without double-tagging.',
  },
  {
    id: 'eval_08',
    category: 'hinglish_chat',
    input: 'Mera naam Rohan Verma hai aur phone +91 9876543210 pe call karna.',
    expectedValues: ['Rohan Verma', '+91 9876543210'],
    notes: 'Hinglish intro cue for name + +91 mobile.',
  },
  {
    id: 'eval_09',
    category: 'verhoeff_trap',
    input: 'UTR ref 884120334411 aur ticket #771234567890 abhi pending hai.',
    expectedValues: [],
    notes: '12-digit UTR & ticket numbers failing Verhoeff must NOT be flagged.',
  },
  {
    id: 'eval_10',
    category: 'obfuscated_upi',
    input: 'Refund priya.k@oksbi ya priya@paytm pe kar dena.',
    expectedValues: ['priya.k@oksbi', 'priya@paytm'],
    notes: 'Dual SBI & Paytm UPI VPAs.',
  },
  {
    id: 'eval_11',
    category: 'hinglish_chat',
    input: 'Address: Flat 302 Koramangala 4th Block Bengaluru 560034 par parcel bhejna.',
    expectedValues: ['Flat 302 Koramangala 4th Block Bengaluru 560034'],
    notes: 'Indian address ending with 6-digit PIN code.',
  },
  {
    id: 'eval_12',
    category: 'kyc_mixed',
    input: 'Customer: Neha Kulkarni | Aadhaar 3425 7718 9045 | PAN BNZPM2501F.',
    expectedValues: ['Neha Kulkarni', '3425 7718 9045', 'BNZPM2501F'],
    notes: 'Structured KYC string with Verhoeff-valid Aadhaar.',
  },
  {
    id: 'eval_13',
    category: 'verhoeff_trap',
    input: 'Tracking ID 901234567891 dispatched from Mumbai hub.',
    expectedValues: [],
    notes: '12-digit logistics tracking ID failing Verhoeff.',
  },
  {
    id: 'eval_14',
    category: 'hinglish_chat',
    input: 'Whatsapp number 7011223344 par PDF bhejo, email ankit.mehta@gmail.com bhi cc rakho.',
    expectedValues: ['7011223344', 'ankit.mehta@gmail.com'],
    notes: 'Bare 7-series WhatsApp number + email.',
  },
  {
    id: 'eval_15',
    category: 'obfuscated_upi',
    input: 'Merchant VPA shop24@icici aur alternate 8800112233@okhdfcbank active hai.',
    expectedValues: ['shop24@icici', '8800112233@okhdfcbank'],
    notes: 'ICICI & HDFC UPI handles.',
  },
  {
    id: 'eval_16',
    category: 'verhoeff_trap',
    input: 'Invoice total INR 45,200 for order 554433221100 settled via NEFT.',
    expectedValues: [],
    notes: 'Order reference number trap (12 digits, invalid Verhoeff).',
  },
];

function computeP95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return Number(sorted[idx].toFixed(3));
}

function calcMetrics(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    precision: Number((precision * 100).toFixed(1)),
    recall: Number((recall * 100).toFixed(1)),
    f1: Number((f1 * 100).toFixed(1)),
  };
}

export function runGoldenEvalBenchmark(): EvalBenchmarkReport {
  let baseTpTotal = 0;
  let baseFpTotal = 0;
  let baseFnTotal = 0;
  let baseTrapFails = 0;
  const baseLatencies: number[] = [];

  let vaultTpTotal = 0;
  let vaultFpTotal = 0;
  let vaultFnTotal = 0;
  let vaultTrapFails = 0;
  const vaultLatencies: number[] = [];

  const cases: EvalCaseResult[] = [];

  for (const gc of GOLDEN_EVAL_CASES) {
    const expectedSet = new Set(gc.expectedValues.map((v) => v.trim()));

    const t0 = performance.now();
    const baseHits = runNaiveBaseline(gc.input).map((h) => h.value.trim());
    baseLatencies.push(performance.now() - t0);

    const t1 = performance.now();
    const vaultHits = detectDeterministicIndianPii(gc.input).map((h) => h.value.trim());
    vaultLatencies.push(performance.now() - t1);

    const baseSet = new Set(baseHits);
    const vaultSet = new Set(vaultHits);

    let bTp = 0;
    let bFp = 0;
    for (const v of baseSet) {
      if (expectedSet.has(v)) bTp++;
      else bFp++;
    }
    const bFn = [...expectedSet].filter((e) => !baseSet.has(e)).length;

    let vTp = 0;
    let vFp = 0;
    for (const v of vaultSet) {
      if (expectedSet.has(v)) vTp++;
      else vFp++;
    }
    const vFn = [...expectedSet].filter((e) => !vaultSet.has(e)).length;

    if (gc.category === 'verhoeff_trap') {
      if (bFp > 0) baseTrapFails++;
      if (vFp > 0) vaultTrapFails++;
    }

    baseTpTotal += bTp;
    baseFpTotal += bFp;
    baseFnTotal += bFn;
    vaultTpTotal += vTp;
    vaultFpTotal += vFp;
    vaultFnTotal += vFn;

    cases.push({
      id: gc.id,
      category: gc.category,
      input: gc.input,
      expectedCount: expectedSet.size,
      baselineTp: bTp,
      baselineFp: bFp,
      baselineFn: bFn,
      vaultTp: vTp,
      vaultFp: vFp,
      vaultFn: vFn,
      notes: gc.notes,
    });
  }

  const baseScores = calcMetrics(baseTpTotal, baseFpTotal, baseFnTotal);
  const vaultScores = calcMetrics(vaultTpTotal, vaultFpTotal, vaultFnTotal);

  return {
    totalCases: GOLDEN_EVAL_CASES.length,
    baseline: {
      ...baseScores,
      falsePositiveTrapsFailed: baseTrapFails,
      p95LatencyMs: computeP95(baseLatencies),
    },
    dpdpVault: {
      ...vaultScores,
      falsePositiveTrapsFailed: vaultTrapFails,
      p95LatencyMs: computeP95(vaultLatencies),
    },
    cases,
  };
}
