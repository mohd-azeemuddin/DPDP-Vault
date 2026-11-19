import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { FirewallAnalysisResult, ImageRedactionResult } from '../shared/types.ts';

interface Props {
  geminiConfigured: boolean;
}

const PRESET_SAMPLES: Array<{ label: string; text: string }> = [
  {
    label: 'Hinglish KYC + Order Trap',
    text: 'Bhai mera naam Aarav Sharma hai. Order ID 4829 1920 3812 abhi pending hai, lekin KYC ke liye Aadhaar 4991 1866 5246 aur PAN ABCPE1234F bhej raha hoon. Refund 9820112233@okaxis pe bhej dena.',
  },
  {
    label: 'MSME Invoice + Hinglish Address',
    text: 'Supplier GSTIN 29AABCU9603R1ZM, IFSC HDFC0000240. Mera whatsapp no 9811223344 hai aur deliver to Flat 402 Indiranagar 100ft Rd Bengaluru 560038.',
  },
  {
    label: 'Obfuscated Spoken Hinglish',
    text: 'Sir customer Priya Nair ka email priya.nair@gmail.com hai, gpay priya@ybl pe payment hua aur ticket #884120334411 close kar do.',
  },
];

export function FirewallWorkspace({ geminiConfigured }: Props) {
  const [inputText, setInputText] = useState(PRESET_SAMPLES[0].text);
  const [useGeminiHybrid, setUseGeminiHybrid] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FirewallAnalysisResult | null>(null);
  const [showRehydrated, setShowRehydrated] = useState(false);

  // Image redaction state
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/png');
  const [imageResult, setImageResult] = useState<ImageRedactionResult | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function runTextAnalysis(overrideText?: string) {
    const targetText = overrideText ?? inputText;
    if (!targetText.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/firewall/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: targetText, useGeminiHybrid }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }
      setResult(data as FirewallAnalysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runTextAnalysis(PRESET_SAMPLES[0].text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function rehydrateText(redacted: string, vault: Record<string, string>): string {
    let out = redacted;
    for (const [token, original] of Object.entries(vault)) {
      out = out.split(token).join(original);
    }
    return out;
  }

  function generateSyntheticKycImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 760;
    canvas.height = 440;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clean light receipt/KYC document surface
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, 724, 404);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(18, 18, 724, 56);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('SYNTHETIC INDIAN KYC & PAYMENT SLIP (DEMO)', 36, 53);

    ctx.fillStyle = '#1e293b';
    ctx.font = '16px sans-serif';
    ctx.fillText('Applicant Name:  Rohan Deshmukh', 42, 115);
    ctx.fillText('Aadhaar Number:  4991 1866 5246', 42, 155);
    ctx.fillText('PAN Card:        ABCPE1234F', 42, 195);
    ctx.fillText('Mobile (WA):     +91 9820112233', 42, 235);
    ctx.fillText('UPI Refund VPA:  rohan.d@okaxis', 42, 275);
    ctx.fillText('Address:         Flat 14, Kothrud, Pune 411038', 42, 315);

    ctx.fillStyle = '#475569';
    ctx.font = '14px monospace';
    ctx.fillText('Order Ref (Non-PII Trap): INV-482919203812   |   Status: Pending', 42, 375);

    const url = canvas.toDataURL('image/png');
    setImageDataUrl(url);
    setImageMime('image/png');
    setImageResult(null);
    setImageError(null);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMime(file.type || 'image/png');
    setImageResult(null);
    setImageError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  async function runImageRedaction() {
    if (!imageDataUrl) return;
    setImageLoading(true);
    setImageError(null);
    try {
      const res = await fetch('/api/firewall/redact-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageDataUrl,
          mimeType: imageMime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image redaction failed');
      }
      setImageResult(data as ImageRedactionResult);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image redaction failed');
    } finally {
      setImageLoading(false);
    }
  }

  // Draw original image + blurred/masked bounding boxes onto canvas
  useEffect(() => {
    if (!imageDataUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);

      if (imageResult && imageResult.boxes.length > 0) {
        for (const box of imageResult.boxes) {
          const [ymin, xmin, ymax, xmax] = box.box2d;
          const x = (xmin / 1000) * canvas.width;
          const y = (ymin / 1000) * canvas.height;
          const w = ((xmax - xmin) / 1000) * canvas.width;
          const h = ((ymax - ymin) / 1000) * canvas.height;

          ctx.save();
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x, y, Math.max(w, 12), Math.max(h, 12));
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, Math.max(w, 12), Math.max(h, 12));
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`[${box.type}]`, x + 4, Math.max(14, y - 4));
          ctx.restore();
        }
      }
    };
    img.src = imageDataUrl;
  }, [imageDataUrl, imageResult]);

  function downloadRedactedPng() {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'dpdp-vault-redacted.png';
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }

  return (
    <div className="space-y-8">
      {/* Section 1: Hinglish Text Firewall */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              01. Hinglish & Indian Identity Privacy Firewall
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Validates Aadhaar using UIDAI Verhoeff checksums to prevent false positives on order IDs, catches NPCI UPI handles, and masks Hinglish context cues.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useGeminiHybrid}
                onChange={(e) => setUseGeminiHybrid(e.target.checked)}
                disabled={!geminiConfigured}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="whitespace-nowrap">
                Gemini Hybrid NER {!geminiConfigured ? '(API key unset)' : ''}
              </span>
            </label>
            <button
              type="button"
              onClick={() => void runTextAnalysis()}
              disabled={loading || !inputText.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {loading ? 'Analyzing...' : 'Run Firewall'}
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
            Load sample:
          </span>
          {PRESET_SAMPLES.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => {
                setInputText(sample.text);
                void runTextAnalysis(sample.text);
              }}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {sample.label}
            </button>
          ))}
        </div>

        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          rows={3}
          placeholder="Paste Hinglish / English text with Aadhaar, PAN, UPI VPA, phone, GSTIN, or order IDs..."
          className="mt-3 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-6">
            {/* Comparison Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Naive Regex Baseline (Presidio-style)
                  </span>
                  <span className="text-xs font-mono tabular-nums text-amber-700 dark:text-amber-400">
                    {result.baselineNaive.falsePositivesCaughtByVault} false positive(s) ·{' '}
                    {result.baselineNaive.missedHinglishCaughtByVault} missed
                  </span>
                </div>
                <p className="font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {result.baselineNaive.redactedText}
                </p>
              </div>

              <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    DPDP-Vault Redacted Output ({result.mode === 'hybrid_gemini' ? 'Hybrid Gemini' : 'Local Deterministic'})
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {result.latencyMs} ms
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowRehydrated((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
                    >
                      {showRehydrated ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {showRehydrated ? 'Hide Vault' : 'Rehydrate Locally'}
                    </button>
                  </div>
                </div>
                <p className="font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 whitespace-pre-wrap">
                  {showRehydrated
                    ? rehydrateText(result.redactedText, result.tokenVault)
                    : result.redactedText}
                </p>
              </div>
            </div>

            {/* Detected Entities Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Detected Entities & Verification Method
                </h3>
                <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {result.entities.length} token(s) vaulted
                </span>
              </div>
              {result.entities.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-3">
                  No DPDP-regulated PII detected in this text.
                </p>
              ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2.5 px-3 font-medium">Token</th>
                        <th className="py-2.5 px-3 font-medium">Entity Type</th>
                        <th className="py-2.5 px-3 font-medium">Matched Value</th>
                        <th className="py-2.5 px-3 font-medium">Detection Method</th>
                        <th className="py-2.5 px-3 font-medium text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {result.entities.map((ent, idx) => (
                        <tr key={`${ent.token}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-xs text-emerald-700 dark:text-emerald-400">
                            {ent.token}
                          </td>
                          <td className="py-2 px-3 text-xs font-medium text-slate-800 dark:text-slate-200">
                            {ent.type}
                          </td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                            {ent.value}
                          </td>
                          <td className="py-2 px-3 text-xs text-slate-600 dark:text-slate-400">
                            {ent.method}
                            {ent.note ? ` · ${ent.note}` : ''}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                            {(ent.confidence * 100).toFixed(0)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Section 2: Multimodal Screenshot / KYC Image Redactor */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              02. Multimodal KYC Screenshot & Receipt Redactor
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Detects PII coordinates inside uploaded WhatsApp screenshots or KYC slips via Gemini Vision and masks bounding boxes on an HTML5 canvas before storage.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={generateSyntheticKycImage}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
              Generate Sample KYC Image
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Upload Screenshot
            </button>
            <button
              type="button"
              onClick={() => void runImageRedaction()}
              disabled={!imageDataUrl || imageLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {imageLoading ? 'Scanning Image...' : 'Detect & Mask PII'}
            </button>
          </div>
        </div>

        {imageError && (
          <div className="mt-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {imageError}
          </div>
        )}

        {!imageDataUrl ? (
          <div className="mt-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Click <strong>Generate Sample KYC Image</strong> or upload any PNG/JPG receipt to test bounding-box PII masking.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3">
              <canvas
                ref={canvasRef}
                className="w-full h-auto rounded border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Redaction Regions
                </h3>
                {imageResult && (
                  <button
                    type="button"
                    onClick={downloadRedactedPng}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PNG
                  </button>
                )}
              </div>

              {imageResult ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      {imageResult.summary} ({imageResult.latencyMs} ms)
                    </span>
                  </p>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {imageResult.boxes.map((b, i) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <div className="flex items-center justify-between font-medium text-slate-800 dark:text-slate-200">
                          <span>{b.type}</span>
                          <span className="font-mono tabular-nums text-slate-500">
                            {(b.confidence * 100).toFixed(0)}%
                          </span>
                        </div>
                        <div className="font-mono text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                          {b.text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Image loaded. Click <strong>Detect &amp; Mask PII</strong> to scan with Gemini Vision.
                </p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
