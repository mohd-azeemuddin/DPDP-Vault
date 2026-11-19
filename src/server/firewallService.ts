import type { FirewallAnalysisResult, PiiEntityType } from '../shared/types.ts';
import { extractContextualHinglishPii, hasGeminiKey } from './geminiClient.ts';
import {
  applyNaiveRedactions,
  detectDeterministicIndianPii,
  resolveOverlaps,
  runNaiveBaseline,
  tokenizeRedactions,
} from './validators.ts';

export async function analyzeWithFirewall(params: {
  text: string;
  useGeminiHybrid: boolean;
}): Promise<FirewallAnalysisResult> {
  const startNs = performance.now();
  const { text, useGeminiHybrid } = params;

  const deterministicMatches = detectDeterministicIndianPii(text);
  let mergedMatches = [...deterministicMatches];
  let mode: FirewallAnalysisResult['mode'] = 'deterministic_only';

  if (useGeminiHybrid) {
    if (!hasGeminiKey()) {
      throw new Error(
        'GEMINI_API_KEY is not configured in Settings > Secrets. Disable Gemini Hybrid or configure the API key.',
      );
    }
    const aiEntities = await extractContextualHinglishPii(text);
    mode = 'hybrid_gemini';
    for (const item of aiEntities) {
      if (!item.exactText || item.exactText.length < 2) continue;
      let searchFrom = 0;
      while (searchFrom < text.length) {
        const idx = text.indexOf(item.exactText, searchFrom);
        if (idx === -1) break;
        mergedMatches.push({
          type: item.type as PiiEntityType,
          value: item.exactText,
          start: idx,
          end: idx + item.exactText.length,
          confidence: 0.92,
          method: 'gemini_ner',
          note: item.reason,
        });
        searchFrom = idx + item.exactText.length;
      }
    }
    mergedMatches = resolveOverlaps(mergedMatches);
  }

  const { redactedText, entities, tokenVault } = tokenizeRedactions(text, mergedMatches);

  // Baseline comparison (Naive Regex / Presidio-style)
  const naiveEntities = runNaiveBaseline(text);
  const naiveRedacted = applyNaiveRedactions(text, naiveEntities);

  const vaultValues = new Set(entities.map((e) => e.value));
  const naiveValues = new Set(naiveEntities.map((e) => e.value));

  let falsePositivesCaughtByVault = 0;
  for (const nv of naiveEntities) {
    if (nv.type === 'AADHAAR_NAIVE' && !vaultValues.has(nv.value)) {
      falsePositivesCaughtByVault++;
    }
  }

  let missedHinglishCaughtByVault = 0;
  for (const ve of entities) {
    if (!naiveValues.has(ve.value)) {
      missedHinglishCaughtByVault++;
    }
  }

  const latencyMs = Number((performance.now() - startNs).toFixed(2));

  return {
    originalLength: text.length,
    redactedText,
    entities,
    tokenVault,
    baselineNaive: {
      redactedText: naiveRedacted,
      entities: naiveEntities,
      falsePositivesCaughtByVault,
      missedHinglishCaughtByVault,
    },
    latencyMs,
    mode,
  };
}
