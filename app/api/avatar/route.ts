import { NextResponse } from 'next/server';

type AvatarStyleKey =
  | 'pixar-3d-masterpiece'
  | 'cyberpunk-neon-strategist'
  | 'corporate-superhero'
  | 'anime-executive'
  | 'futuristic-fintech-commander'
  | 'minimal-editorial-portrait';

type AvatarRequest = {
  imageBase64?: string;
  mimeType?: string;
  persona?: string;
  avatarStyleKey?: AvatarStyleKey;
  fallbackAvatar?: string;
};

// ── Fallback avatar pool ──────────────────────────────────────────────────────
// Place pre-generated Pixar-style avatars in /public/avatars/
// One is picked at random whenever fal.ai fails for any reason.
const FALLBACK_AVATARS = [
  '/avatars/fallback-1.png',
  '/avatars/fallback-2.png',
  '/avatars/fallback-3.png',
  '/avatars/fallback-4.png',
  '/avatars/fallback-5.png',
  '/avatars/fallback-6.png',
];

function randomFallback(): string {
  return FALLBACK_AVATARS[Math.floor(Math.random() * FALLBACK_AVATARS.length)];
}

// ── Style colour hints ────────────────────────────────────────────────────────
// All styles share the same Pixar-3D base. Style key only changes
// clothing colour and background tone — identity is always preserved.
const STYLE_COLOUR_HINTS: Record<AvatarStyleKey, string> = {
  'pixar-3d-masterpiece':
    'wearing a bold cobalt blue crew-neck t-shirt, pure white background, bright cheerful lighting',
  'cyberpunk-neon-strategist':
    'wearing a deep purple crew-neck t-shirt, very dark navy background, subtle cyan edge glow',
  'corporate-superhero':
    'wearing a confident red crew-neck t-shirt, clean mid-grey background, strong confident posture',
  'anime-executive':
    'wearing a sunshine yellow collared polo shirt, soft cream white background, friendly warm lighting',
  'futuristic-fintech-commander':
    'wearing a teal crew-neck t-shirt, dark charcoal background, subtle cool blue ambient light',
  'minimal-editorial-portrait':
    'wearing a soft coral pink crew-neck t-shirt, clean warm off-white background, soft natural lighting',
};

function buildPrompt(persona: string, styleKey: AvatarStyleKey): string {
  const colourHint = STYLE_COLOUR_HINTS[styleKey] ?? STYLE_COLOUR_HINTS['pixar-3d-masterpiece'];
  return [
    'Transform this photo into a premium Pixar-style 3D animated avatar portrait.',
    'The result must look like a high-quality Pixar or Disney character render:',
    'smooth rounded facial geometry, clean simplified skin with subtle warm shading,',
    'slightly enlarged friendly eyes, polished 3D hair with clear strand groupings,',
    'soft cinematic rim lighting, gentle ambient occlusion, and a studio-quality finish.',
    `Character: ${colourHint}.`,
    `Professional context: ${persona}.`,
    'Head-and-shoulders composition, centered, slight upward camera angle.',
    "Faithfully preserve the person's facial identity: face shape, skin tone, hair colour,",
    'hair style direction, eye colour, and distinguishing features like glasses or beard.',
    'The style should transform photographic realism into 3D cartoon — not replace the identity.',
    'Background must be clean, simple, and non-distracting.',
    'Output: single character, no extra people, no extra limbs, no text, no logos,',
    'no watermarks, no distorted eyes, no asymmetric faces.',
    'Quality: ultra-sharp, gallery-ready, professionally polished.',
  ].join(' ');
}

// ── fal.ai config ─────────────────────────────────────────────────────────────
const FAL_ENDPOINT = 'https://queue.fal.run/fal-ai/flux/dev/image-to-image';
const MAX_POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 1500;

const FAL_CONFIG = {
  strength: 0.88,        // High enough for full art-style transformation
  guidance_scale: 12,    // Stronger prompt adherence — forces the Pixar aesthetic
  num_images: 1,
  image_size: { width: 1024, height: 1024 },
  sync_mode: false,
  enable_safety_checker: true,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exhaustively check all known fal.ai response shapes for an image URL
function extractAvatarUrl(data: any): string | null {
  if (!data) return null;

  // Direct image array (sync response)
  if (Array.isArray(data?.images) && data.images[0]?.url) return data.images[0].url;
  // Single image object
  if (data?.image?.url) return data.image.url;
  // Nested result
  if (Array.isArray(data?.result?.images) && data.result.images[0]?.url) return data.result.images[0].url;
  if (data?.result?.image?.url) return data.result.image.url;
  // Response wrapper
  if (Array.isArray(data?.response?.images) && data.response.images[0]?.url) return data.response.images[0].url;
  // Output array (some fal endpoints)
  if (Array.isArray(data?.output) && data.output[0]?.url) return data.output[0].url;
  if (typeof data?.output === 'string' && data.output.startsWith('http')) return data.output;

  return null;
}

async function fetchFalJson(url: string, falKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    cache: 'no-store',
  });
  let data: any = null;
  try { data = await response.json(); } catch { data = null; }
  return { response, data };
}

async function pollForResult(initialData: any, falKey: string): Promise<string | null> {
  let currentData = initialData;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    // Check current data for an image URL first
    const url = extractAvatarUrl(currentData);
    if (url) {
      console.log(`fal.ai: got image URL on attempt ${attempt}`);
      return url;
    }

    const status = currentData?.status;
    console.log(`fal.ai poll attempt ${attempt}: status=${status}`);

    if (status === 'COMPLETED') {
      // Status says done but extractAvatarUrl didn't find it — try response_url
      if (currentData?.response_url) {
        const finalResult = await fetchFalJson(currentData.response_url, falKey);
        console.log('fal.ai COMPLETED response_url result:', JSON.stringify(finalResult.data).slice(0, 300));
        const finalUrl = extractAvatarUrl(finalResult.data);
        if (finalUrl) return finalUrl;
      }
      console.error('fal.ai COMPLETED but no image found in:', JSON.stringify(currentData).slice(0, 500));
      return null;
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      console.error('fal.ai job failed/cancelled:', currentData);
      return null;
    }

    // Still in queue — wait then poll status
    await sleep(POLL_INTERVAL_MS);

    const statusUrl = currentData?.status_url || initialData?.status_url;
    if (!statusUrl) {
      console.error('fal.ai: no status_url to poll, data:', JSON.stringify(currentData).slice(0, 300));
      return null;
    }

    const statusResult = await fetchFalJson(statusUrl, falKey);
    if (!statusResult.response.ok) {
      console.error('fal.ai status poll HTTP error:', statusResult.response.status, statusResult.data);
      return null;
    }

    currentData = statusResult.data;
  }

  console.error('fal.ai: polling timed out after', MAX_POLL_ATTEMPTS, 'attempts');
  return null;
}

// ── Download fal.ai image and return as base64 ────────────────────────────────
// This avoids all CORS/expiry issues — the server fetches the image and
// returns it as a data URI that the browser can always display directly.
async function downloadAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(imageUrl, { cache: 'no-store' });
    if (!response.ok) {
      console.error('Failed to download fal.ai image:', response.status, imageUrl);
      return null;
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    console.log(`fal.ai image downloaded: ${Math.round(arrayBuffer.byteLength / 1024)}KB, type=${mimeType}`);
    return { base64, mimeType };
  } catch (err) {
    console.error('Error downloading fal.ai image:', err);
    return null;
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AvatarRequest;
    const {
      imageBase64,
      mimeType = 'image/jpeg',
      persona = 'Professional business leader',
      avatarStyleKey = 'pixar-3d-masterpiece',
    } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { avatarUrl: randomFallback(), source: 'fallback', reason: 'missing-image' },
        { status: 200 },
      );
    }

    // AVATAR_AI_ENABLED=false → skip fal.ai entirely, use fallback pool
    // Flip this in Vercel environment variables instantly without a redeploy
    if (!process.env.FAL_KEY || process.env.AVATAR_AI_ENABLED === 'false') {
      console.log('Avatar AI disabled or FAL_KEY missing — returning fallback avatar.');
      return NextResponse.json(
        { avatarUrl: randomFallback(), source: 'fallback', reason: 'ai-disabled' },
        { status: 200 },
      );
    }

    const normalizedMime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const dataUri = `data:${normalizedMime};base64,${imageBase64}`;
    const prompt = buildPrompt(persona, avatarStyleKey);

    console.log('fal.ai: submitting job, style=', avatarStyleKey);

    const falResponse = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, image_url: dataUri, ...FAL_CONFIG }),
      cache: 'no-store',
    });

    if (!falResponse.ok) {
      let errorPayload: unknown = null;
      try { errorPayload = await falResponse.json(); }
      catch { errorPayload = await falResponse.text(); }
      console.error('fal.ai submit failed:', { status: falResponse.status, errorPayload });
      return NextResponse.json(
        { avatarUrl: randomFallback(), source: 'fallback', reason: 'fal-submit-error' },
        { status: 200 },
      );
    }

    const initialData = await falResponse.json();
    console.log('fal.ai initial response:', JSON.stringify(initialData).slice(0, 400));

    // Poll for the result
    const avatarUrl = await pollForResult(initialData, process.env.FAL_KEY);

    if (!avatarUrl) {
      console.error('fal.ai: no image URL obtained after polling');
      return NextResponse.json(
        { avatarUrl: randomFallback(), source: 'fallback', reason: 'no-url' },
        { status: 200 },
      );
    }

    // Download the image server-side and return as base64
    // This eliminates CORS issues and URL expiry problems on the client
    const downloaded = await downloadAsBase64(avatarUrl);

    if (!downloaded) {
      // URL obtained but download failed — return the URL directly as last resort
      console.warn('fal.ai: download failed, returning URL directly:', avatarUrl);
      return NextResponse.json(
        { avatarUrl, source: 'fal-url', style: { key: avatarStyleKey } },
        { status: 200 },
      );
    }

    // Return as base64 data URI — always displayable, no CORS, no expiry
    return NextResponse.json({
      imageBase64: downloaded.base64,
      mimeType: downloaded.mimeType,
      source: 'fal',
      style: { key: avatarStyleKey },
    });

  } catch (error) {
    console.error('Avatar route unexpected error:', error);
    return NextResponse.json(
      { avatarUrl: randomFallback(), source: 'fallback', reason: 'unexpected-error' },
      { status: 200 },
    );
  }
}
