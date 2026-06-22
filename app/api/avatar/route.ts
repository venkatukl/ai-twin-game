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

type StyleConfig = {
  label: string;
  promptModifier: string;
  strength: number;
  guidanceScale: number;
  numImages: number;
};

const DEFAULT_FALLBACK = '/avatars/captain-compliance.png';
const FAL_ENDPOINT = 'https://queue.fal.run/fal-ai/flux/dev/image-to-image';
const MAX_POLL_ATTEMPTS = 18;
const POLL_INTERVAL_MS = 1500;

const STYLE_PRESETS: Record<AvatarStyleKey, StyleConfig> = {
  'pixar-3d-masterpiece': {
    label: 'Pixar 3D Masterpiece',
    promptModifier:
      'Create a premium 3D animated executive portrait with expressive but professional facial styling, soft cinematic rim lighting, polished materials, clean stylized hair, subtle depth, and a refined family-friendly studio aesthetic.',
    strength: 0.72,
    guidanceScale: 7.5,
    numImages: 1
  },
  'cyberpunk-neon-strategist': {
    label: 'Cyberpunk Neon Strategist',
    promptModifier:
      'Create a futuristic cyberpunk executive portrait with elegant neon accents, sleek business styling, high-contrast cinematic lighting, subtle holographic atmosphere, cool-toned depth, and a premium tech-noir look.',
    strength: 0.7,
    guidanceScale: 8,
    numImages: 1
  },
  'corporate-superhero': {
    label: 'Corporate Superhero',
    promptModifier:
      'Create a professional corporate superhero portrait with confident posture, heroic executive presence, refined business wardrobe, clean dramatic lighting, subtle premium power cues, and a cinematic polished finish.',
    strength: 0.68,
    guidanceScale: 7.2,
    numImages: 1
  },
  'anime-executive': {
    label: 'Anime Executive',
    promptModifier:
      'Create a refined anime executive portrait with clean line-inspired styling, elegant facial proportions, expressive eyes, premium business attire, luminous soft lighting, and a modern polished background.',
    strength: 0.74,
    guidanceScale: 7.8,
    numImages: 1
  },
  'futuristic-fintech-commander': {
    label: 'Futuristic Fintech Commander',
    promptModifier:
      'Create a futuristic fintech commander portrait with premium interface-inspired styling, sleek executive attire, precise lighting, subtle data-driven visual motifs, and a confident next-generation leadership aesthetic.',
    strength: 0.69,
    guidanceScale: 7.6,
    numImages: 1
  },
  'minimal-editorial-portrait': {
    label: 'Minimal Editorial Portrait',
    promptModifier:
      'Create a minimalist editorial portrait with premium magazine-style composition, elegant wardrobe, restrained color palette, clean soft lighting, natural skin rendering, and an upscale modern business aesthetic.',
    strength: 0.58,
    guidanceScale: 6.8,
    numImages: 1
  }
};

function getStylePreset(key?: AvatarStyleKey): StyleConfig {
  if (key && STYLE_PRESETS[key]) {
    return STYLE_PRESETS[key];
  }

  return STYLE_PRESETS['pixar-3d-masterpiece'];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAvatarUrl(data: any): string | null {
  return (
    data?.images?.[0]?.url ||
    data?.image?.url ||
    data?.result?.images?.[0]?.url ||
    data?.response?.images?.[0]?.url ||
    null
  );
}

async function fetchFalJson(url: string, falKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json'
    },
    cache: 'no-store'
  });

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { response, data };
}

async function resolveQueuedFalResult(initialData: any, falKey: string) {
  let currentData = initialData;

  const initialUrl = currentData?.response_url || currentData?.status_url;
  if (!initialUrl) {
    return null;
  }

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const immediateUrl = extractAvatarUrl(currentData);
    if (immediateUrl) {
      return immediateUrl;
    }

    const status = currentData?.status;
    if (status === 'COMPLETED') {
      const completedUrl = extractAvatarUrl(currentData);
      if (completedUrl) return completedUrl;

      if (currentData?.response_url) {
        const finalResult = await fetchFalJson(currentData.response_url, falKey);
        const finalUrl = extractAvatarUrl(finalResult.data);
        if (finalUrl) return finalUrl;
      }

      return null;
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      console.error('fal.ai queue failed:', currentData);
      return null;
    }

    await sleep(POLL_INTERVAL_MS);

    const statusTarget = currentData?.status_url || initialData?.status_url || initialUrl;
    const statusResult = await fetchFalJson(statusTarget, falKey);

    if (!statusResult.response.ok) {
      console.error('fal.ai status poll failed:', {
        status: statusResult.response.status,
        statusText: statusResult.response.statusText,
        data: statusResult.data
      });
      return null;
    }

    currentData = statusResult.data;

    const queuedUrl = extractAvatarUrl(currentData);
    if (queuedUrl) {
      return queuedUrl;
    }

    if (currentData?.status === 'COMPLETED' && currentData?.response_url) {
      const finalResult = await fetchFalJson(currentData.response_url, falKey);
      const finalUrl = extractAvatarUrl(finalResult.data);
      if (finalUrl) return finalUrl;
    }
  }

  console.error('fal.ai queue polling timed out:', initialData);
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AvatarRequest;

    const {
      imageBase64,
      mimeType = 'image/jpeg',
      persona = 'Professional business leader',
      avatarStyleKey,
      fallbackAvatar = DEFAULT_FALLBACK
    } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { avatarUrl: fallbackAvatar, source: 'fallback', reason: 'missing-image' },
        { status: 200 }
      );
    }

    if (!process.env.FAL_KEY) {
      console.warn('FAL_KEY is not configured. Returning fallback avatar.');
      return NextResponse.json(
        { avatarUrl: fallbackAvatar, source: 'fallback', reason: 'missing-fal-key' },
        { status: 200 }
      );
    }

    const stylePreset = getStylePreset(avatarStyleKey);
    const normalizedMimeType = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
    const dataUri = `data:${normalizedMimeType};base64,${imageBase64}`;

    const prompt = [
      'Create a premium avatar portrait for an internal AI hackathon game.',
      `Persona context: ${persona}.`,
      `Style direction: ${stylePreset.promptModifier}`,
      'Preserve facial identity, hair direction, skin tone, and overall likeness from the source image.',
      'Use a centered head-and-shoulders composition.',
      'Use a clean premium background appropriate for an enterprise game experience.',
      'Make the result visually polished, high quality, and presentation friendly.',
      'Avoid extra people, extra limbs, duplicated facial features, distorted eyes, text, logos, watermarks, or clutter.'
    ].join(' ');

    const falPayload = {
      prompt,
      image_url: dataUri,
      strength: stylePreset.strength,
      guidance_scale: stylePreset.guidanceScale,
      num_images: stylePreset.numImages,
      image_size: {
        width: 1024,
        height: 1024
      },
      sync_mode: true,
      enable_safety_checker: true
    };

    const falResponse = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(falPayload),
      cache: 'no-store'
    });

    if (!falResponse.ok) {
      let errorPayload: unknown = null;

      try {
        errorPayload = await falResponse.json();
      } catch {
        errorPayload = await falResponse.text();
      }

      console.error('fal.ai avatar generation failed:', {
        status: falResponse.status,
        statusText: falResponse.statusText,
        errorPayload,
        avatarStyleKey
      });

      return NextResponse.json(
        { avatarUrl: fallbackAvatar, source: 'fallback', reason: 'fal-error' },
        { status: 200 }
      );
    }

    const initialData = await falResponse.json();

    let avatarUrl = extractAvatarUrl(initialData);

    if (!avatarUrl && (initialData?.status === 'IN_QUEUE' || initialData?.status_url || initialData?.response_url)) {
      avatarUrl = await resolveQueuedFalResult(initialData, process.env.FAL_KEY);
    }

    if (!avatarUrl) {
      console.error('fal.ai returned success but no image URL:', initialData);

      return NextResponse.json(
        { avatarUrl: fallbackAvatar, source: 'fallback', reason: 'missing-output-url' },
        { status: 200 }
      );
    }

    return NextResponse.json({
      avatarUrl,
      source: 'fal',
      style: {
        key: avatarStyleKey ?? 'pixar-3d-masterpiece',
        label: stylePreset.label,
        strength: stylePreset.strength,
        guidanceScale: stylePreset.guidanceScale,
        numImages: stylePreset.numImages
      }
    });
  } catch (error) {
    console.error('Avatar route unexpected error:', error);

    return NextResponse.json(
      {
        avatarUrl: DEFAULT_FALLBACK,
        source: 'fallback',
        reason: 'unexpected-error'
      },
      { status: 200 }
    );
  }
}