import scenarios from '@/data/scenarios.json';

// Groq is OpenAI-API-compatible — no special SDK needed
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// Directional label helpers
function delta(user: number, ideal: number): string {
  const diff = user - ideal;
  if (Math.abs(diff) <= 8) return 'spot on';
  return diff > 0 ? 'too high' : 'too low';
}

function dimensionScore(diff: number, factor: number): number {
  return Math.max(20, Math.min(100, Math.round(100 - Math.abs(diff) * factor)));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { scenarioId, profile, action } = body as {
    scenarioId: string;
    profile: { role: string; risk: number; compliance: number; growth: number; aiTrust: number; aiCost: number };
    action: string;
  };

  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    return Response.json({ error: 'Invalid scenario id' }, { status: 404 });
  }

  const bp = scenario.bestProfile as {
    risk: number; compliance: number; growth: number; aiTrust: number; aiCost?: number;
  };
  const idealAiCost = bp.aiCost ?? 55;

  // ── Local fallback scores (used when no API key or on API error) ──────────
  const localDimensions = {
    riskCalibration:     dimensionScore(profile.risk        - bp.risk,        1.3),
    complianceAlignment: dimensionScore(profile.compliance  - bp.compliance,   1.25),
    growthJudgment:      dimensionScore(profile.growth      - bp.growth,       1.2),
    aiGovernance:        dimensionScore(profile.aiTrust     - bp.aiTrust,      1.25),
    aiCostDiscipline:    dimensionScore(profile.aiCost      - idealAiCost,     1.2),
  };
  const actionMatch = action.toLowerCase() === scenario.recommendedAction.toLowerCase();
  const actionBonus = actionMatch ? 12 : scenario.recommendedAction.toLowerCase().includes(action.toLowerCase()) ? 6 : 0;
  const dimAvg = Math.round(Object.values(localDimensions).reduce((a, b) => a + b, 0) / 5);
  const localScore = Math.max(18, Math.min(100, dimAvg + actionBonus));

  // Profile deltas for UI display (always computed locally, no AI needed)
  const profileDeltas = [
    { label: 'Risk appetite',      user: profile.risk,       ideal: bp.risk,        direction: delta(profile.risk, bp.risk) },
    { label: 'Compliance focus',   user: profile.compliance, ideal: bp.compliance,  direction: delta(profile.compliance, bp.compliance) },
    { label: 'Growth drive',       user: profile.growth,     ideal: bp.growth,      direction: delta(profile.growth, bp.growth) },
    { label: 'AI trust',           user: profile.aiTrust,    ideal: bp.aiTrust,     direction: delta(profile.aiTrust, bp.aiTrust) },
    { label: 'AI cost discipline', user: profile.aiCost,     ideal: idealAiCost,    direction: delta(profile.aiCost, idealAiCost) },
  ];

  // ── No API key → return clean local fallback immediately ─────────────────
  if (!process.env.GROQ_API_KEY) {
    return Response.json({
      mode: 'local-fallback',
      score: localScore,
      verdict: localScore >= 80 ? 'Strong balance' : localScore >= 60 ? 'Promising but exposed' : 'Needs tighter controls',
      dimensions: localDimensions,
      rationale: 'Add GROQ_API_KEY to your Vercel environment variables to enable live AI judging.',
      idealAction: scenario.recommendedAction,
      personaComparison: `A typical ${profile.role} facing "${scenario.title}" would have chosen to ${scenario.recommendedAction}. ${scenario.coachingTip}`,
      profileDeltas,
    });
  }

  // ── Groq prompt ───────────────────────────────────────────────────────────
  const prompt = `You are an expert business decision coach judging a hackathon challenge.

A participant is playing the role of a ${profile.role}. They were given the following scenario and asked to respond as that persona would.

SCENARIO
Title: ${scenario.title}
Category: ${scenario.category} | Difficulty: ${scenario.difficulty} | Time pressure: ${scenario.timePressure}
Summary: ${scenario.summary}
Key facts: ${scenario.facts.map((f, i) => `${i + 1}. ${f}`).join(' ')}

PARTICIPANT'S RESPONSE
Chosen action: ${action}
Their profile sliders (0–100 scale):
  - Risk appetite: ${profile.risk}
  - Compliance focus: ${profile.compliance}
  - Growth drive: ${profile.growth}
  - AI trust: ${profile.aiTrust}
  - AI cost discipline: ${profile.aiCost}

IDEAL BENCHMARK for this scenario (what a well-calibrated ${profile.role} should have)
  - Recommended action: ${scenario.recommendedAction}
  - Ideal risk appetite: ${bp.risk}
  - Ideal compliance focus: ${bp.compliance}
  - Ideal growth drive: ${bp.growth}
  - Ideal AI trust: ${bp.aiTrust}
  - Ideal AI cost discipline: ${idealAiCost}

Your job: score this participant and write a short, direct coaching narrative comparing what they did to what a typical, well-calibrated ${profile.role} would do.

Return ONLY valid JSON with these exact keys:
{
  "score": <integer 0-100>,
  "verdict": <one of: "Strong balance" | "Promising but exposed" | "Needs tighter controls">,
  "dimensions": {
    "riskCalibration": <integer 0-100>,
    "complianceAlignment": <integer 0-100>,
    "growthJudgment": <integer 0-100>,
    "aiGovernance": <integer 0-100>,
    "aiCostDiscipline": <integer 0-100>
  },
  "rationale": "<2-3 sentence overall verdict. Be specific about the score and what drove it.>",
  "personaComparison": "<3-4 sentences written directly to the participant. Start with what a typical ${profile.role} would have done differently. Then explain the key gap between their choices and the ideal. End with one concrete takeaway they can remember. Be direct, not preachy. Do not use bullet points.>"
}`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Groq API error:', err);
      throw new Error('Groq API returned non-200');
    }

    const groqData = await res.json();
    const raw = groqData.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    return Response.json({
      ...parsed,
      idealAction: scenario.recommendedAction,
      profileDeltas,
    });

  } catch (err) {
    console.error('Scoring error, using local fallback:', err);
    // Return local scores so the UI always gets something useful
    return Response.json({
      mode: 'local-fallback',
      score: localScore,
      verdict: localScore >= 80 ? 'Strong balance' : localScore >= 60 ? 'Promising but exposed' : 'Needs tighter controls',
      dimensions: localDimensions,
      rationale: 'AI scoring encountered an error. Showing estimated score based on your profile.',
      idealAction: scenario.recommendedAction,
      personaComparison: `A typical ${profile.role} facing "${scenario.title}" would have chosen to ${scenario.recommendedAction}. ${scenario.coachingTip}`,
      profileDeltas,
    });
  }
}
