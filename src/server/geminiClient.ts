import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { ImageRedactionBox, PiiEntityType } from '../shared/types.ts';

let cachedAiClient: GoogleGenAI | null = null;

export function hasGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim().length > 0 && key !== 'MY_GEMINI_API_KEY');
}

export function getGeminiClient(): GoogleGenAI {
  if (!hasGeminiKey()) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets to enable Gemini hybrid Hinglish NER, image redaction, and grounded RAG.',
    );
  }
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedAiClient;
}

export interface GeminiPiiEntity {
  type: PiiEntityType;
  exactText: string;
  reason: string;
}

export async function extractContextualHinglishPii(text: string): Promise<GeminiPiiEntity[]> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Analyze this Indian English / Hinglish / regional-context message and extract ONLY genuine Personally Identifiable Information (PII) that must be protected under India's DPDP Act.

Rules:
- Return the exact substring as it appears in the input text.
- Catch contextual person names (e.g., "Bhai Ramesh Kumar ko bhejna", "Dr. Sunita Rao"), street/home addresses, spoken/spaced phone numbers, and UPI handles.
- DO NOT flag product names, invoice/order IDs (like "Order #9820112233"), company names (like "HDFC Bank"), or generic dates/amounts.

Message:
"""
${text}
"""`,
          },
        ],
      },
    ],
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          entities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: {
                  type: Type.STRING,
                  description:
                    'One of: AADHAAR, PAN, UPI_ID, PHONE_IN, GSTIN, IFSC, EMAIL, PERSON_NAME, ADDRESS',
                },
                exactText: {
                  type: Type.STRING,
                  description: 'Exact verbatim substring from input text',
                },
                reason: {
                  type: Type.STRING,
                  description: 'Short explanation of why this is PII',
                },
              },
              required: ['type', 'exactText', 'reason'],
            },
          },
        },
        required: ['entities'],
      },
    },
  });

  const raw = (response.text ?? '{"entities":[]}').trim();
  const parsed = JSON.parse(raw) as { entities?: GeminiPiiEntity[] };
  return parsed.entities ?? [];
}

export async function detectImagePiiBoxes(
  base64Data: string,
  mimeType: string,
): Promise<{ boxes: ImageRedactionBox[]; summary: string }> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: `Inspect this Indian document / WhatsApp screenshot / receipt image for DPDP-sensitive PII regions.
Locate bounding boxes for any visible:
- AADHAAR number or masked Aadhaar/QR identity block
- PAN number
- PHONE_IN (mobile numbers)
- UPI_ID (VPA handles)
- PERSON_NAME (customer/cardholder name)
- ADDRESS (home address / PIN code)
- EMAIL
- GSTIN / IFSC

Return bounding boxes in normalized 0-1000 coordinates [ymin, xmin, ymax, xmax]. Be generous enough in box margins to fully cover the sensitive text.`,
        },
      ],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'One-sentence summary of PII detected in the image',
          },
          boxes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                text: { type: Type.STRING },
                ymin: { type: Type.INTEGER },
                xmin: { type: Type.INTEGER },
                ymax: { type: Type.INTEGER },
                xmax: { type: Type.INTEGER },
                confidence: { type: Type.NUMBER },
              },
              required: ['type', 'text', 'ymin', 'xmin', 'ymax', 'xmax', 'confidence'],
            },
          },
        },
        required: ['summary', 'boxes'],
      },
    },
  });

  const raw = (response.text ?? '{"summary":"No PII detected","boxes":[]}').trim();
  const parsed = JSON.parse(raw) as {
    summary?: string;
    boxes?: Array<{
      type: PiiEntityType;
      text: string;
      ymin: number;
      xmin: number;
      ymax: number;
      xmax: number;
      confidence: number;
    }>;
  };

  return {
    summary: parsed.summary ?? 'Scan complete.',
    boxes: (parsed.boxes ?? []).map((b) => ({
      type: b.type,
      text: b.text,
      box2d: [
        Math.max(0, Math.min(1000, b.ymin)),
        Math.max(0, Math.min(1000, b.xmin)),
        Math.max(0, Math.min(1000, b.ymax)),
        Math.max(0, Math.min(1000, b.xmax)),
      ],
      confidence: b.confidence,
    })),
  };
}

export async function embedTextWithGemini(text: string): Promise<number[]> {
  const ai = getGeminiClient();
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-2',
    contents: text,
  });
  const values = result.embeddings?.[0]?.values;
  if (!values || values.length === 0) {
    throw new Error('Gemini embedding API returned an empty vector.');
  }
  return values;
}

export async function generateGroundedRagAnswer(params: {
  query: string;
  agentRole: string;
  purpose: string;
  contexts: Array<{ chunkId: string; principalId: string; text: string }>;
}): Promise<string> {
  const ai = getGeminiClient();
  const contextBlock = params.contexts
    .map((c, idx) => `[${idx + 1}] (${c.chunkId} | ${c.principalId}): ${c.text}`)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Agent Role: ${params.agentRole}
Authorized DPDP Purpose: ${params.purpose}
User Query: ${params.query}

Authorized & Decrypted Context Chunks:
${contextBlock}

Instructions:
- Answer strictly from the provided authorized context chunks.
- Preserve masked PII tokens (like <AADHAAR_1>, <UPI_ID_1>) verbatim—never attempt to reconstruct masked tokens.
- Cite chunk IDs inline like [chunk_id].`,
    config: {
      systemInstruction:
        'You are a DPDP-compliant enterprise assistant. Answer concisely using only verified, consent-authorized records.',
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  return (response.text ?? '').trim();
}
