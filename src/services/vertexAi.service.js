const fs   = require('fs/promises');
const path = require('path');
const { VertexAI } = require('@google-cloud/vertexai');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION   = process.env.GCP_VERTEX_LOCATION || 'us-central1';
const MODEL_NAME = process.env.GCP_VERTEX_MODEL || 'gemini-2.0-flash';

let vertexAI = null;
function getModel() {
  if (!PROJECT_ID) {
    throw new Error('GCP_PROJECT_ID is not configured — Vertex AI product review is unavailable');
  }
  if (!vertexAI) vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
  return vertexAI.getGenerativeModel({ model: MODEL_NAME });
}

// Product images are stored on local disk, served at /uploads/*, and may
// not be reachable from Google's servers depending on network/firewall
// config — so we read the bytes directly and send them inline rather than
// depending on external URL fetchability.
async function imagePathToPart(relativeUrl) {
  const uploadDir = path.join(__dirname, '..', '..', process.env.UPLOAD_DIR || 'uploads');
  const relPath   = relativeUrl.replace(/^\/uploads\//, '');
  const filePath  = path.join(uploadDir, relPath);
  const buffer    = await fs.readFile(filePath);
  const ext       = path.extname(filePath).toLowerCase();
  const mimeType  = { '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  return { inlineData: { mimeType, data: buffer.toString('base64') } };
}

// Sends `prompt` (loaded fresh from DB by the caller — never hardcoded here)
// plus the product's text fields, a sample of the vendor's other active
// listings (for consistency-checking), and the product's images, to a
// Gemini multimodal model. Expects the model to return strict JSON:
// { verdict: 'approve'|'flag', confidence: 0-1, reason: string }
//
// Fails SAFE toward manual review: any parse failure or API error results
// in a 'flag' verdict, never a silent 'approve'.
async function analyzeProduct({ prompt, product, catalogSample }) {
  try {
    const model = getModel();

    const textContext = [
      prompt,
      '',
      '--- Product to review ---',
      `Name: ${product.name}`,
      `Description: ${product.description || '(none)'}`,
      `Category: ${product.category?.name || product.category || '(uncategorized)'}`,
      `Brand: ${product.brand || '(none)'}`,
      '',
      '--- This vendor\'s other active listings (for consistency check) ---',
      (catalogSample || []).map(p => `- ${p.name} (${p.category?.name || p.category || 'uncategorized'})`).join('\n') || '(vendor has no other active listings yet)',
      '',
      'Respond with STRICT JSON only, no markdown fences, no extra text: {"verdict":"approve"|"flag","confidence":0.0-1.0,"reason":"short human-readable explanation"}',
    ].join('\n');

    const imageParts = [];
    for (const img of (product.images || []).slice(0, 4)) {
      try {
        imageParts.push(await imagePathToPart(img));
      } catch (e) {
        // Missing/unreadable image file shouldn't crash the whole review —
        // just proceed without that particular image part.
      }
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: textContext }, ...imageParts] }],
    });

    const raw = result?.response?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.verdict !== 'approve' && parsed.verdict !== 'flag') throw new Error('Unexpected verdict value');

    return {
      verdict: parsed.verdict,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
      reason: parsed.reason || '',
      raw,
    };
  } catch (err) {
    return {
      verdict: 'flag',
      confidence: null,
      reason: `AI review could not complete (${err.message}) — routed to manual review as a precaution.`,
      raw: '',
    };
  }
}

module.exports = { analyzeProduct };
