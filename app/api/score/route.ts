import scenarios from '@/data/scenarios.json';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = 'llama-3.3-70b-versatile';

// ── Scoring helpers ───────────────────────────────────────────────────────────
// Softer penalty curve: ±15 still scores 80+, only large deviations hurt badly
function dimensionScore(diff: number): number {
  return Math.max(25, Math.min(100, Math.round(100 - Math.abs(diff) * 0.65)));
}

// Action is the primary judgment — worth 50% of total score
function actionScore(selectedCode: string, correctCode: string): number {
  return selectedCode.toUpperCase() === correctCode.toUpperCase() ? 50 : 0;
}

// Returns only gaps that are meaningfully off (> 12 points), max 3, sorted by magnitude
function topGaps(
  profile: { risk: number; compliance: number; growth: number; aiTrust: number; aiCost: number },
  bp: { risk: number; compliance: number; growth: number; aiTrust: number; aiCost?: number },
  idealAiCost: number,
) {
  const all = [
    { label: 'Risk appetite',      user: profile.risk,       ideal: bp.risk,       diff: profile.risk       - bp.risk },
    { label: 'Compliance focus',   user: profile.compliance, ideal: bp.compliance, diff: profile.compliance - bp.compliance },
    { label: 'Growth drive',       user: profile.growth,     ideal: bp.growth,     diff: profile.growth     - bp.growth },
    { label: 'AI trust',           user: profile.aiTrust,    ideal: bp.aiTrust,    diff: profile.aiTrust    - bp.aiTrust },
    { label: 'AI cost discipline', user: profile.aiCost,     ideal: idealAiCost,   diff: profile.aiCost     - idealAiCost },
  ];
  return all
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .map((g) => ({ ...g, direction: g.diff > 0 ? 'too high' : g.diff < 0 ? 'too low' : 'spot on' }));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { scenarioId, profile, action } = body as {
    scenarioId: string;
    profile: { role: string; risk: number; compliance: number; growth: number; aiTrust: number; aiCost: number };
    action: string;
  };

  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return Response.json({ error: 'Invalid scenario id' }, { status: 404 });

  const bp = scenario.bestProfile as {
    risk: number; compliance: number; growth: number; aiTrust: number; aiCost?: number;
  };
  const correctLabel = scenario.options?.find((o: any) => o.code === scenario.correctOption)?.label ?? scenario.correctOption;
  const idealAiCost = bp.aiCost ?? 55;

  // ── Local fallback scoring ────────────────────────────────────────────────
  // Action = 50 pts, slider alignment = 50 pts (avg of 5 dims)
  const aScore = actionScore(action, scenario.correctOption);
  const dimScores = {
    riskCalibration:     dimensionScore(profile.risk       - bp.risk),
    complianceAlignment: dimensionScore(profile.compliance - bp.compliance),
    growthJudgment:      dimensionScore(profile.growth     - bp.growth),
    aiGovernance:        dimensionScore(profile.aiTrust    - bp.aiTrust),
    aiCostDiscipline:    dimensionScore(profile.aiCost     - idealAiCost),
  };
  const sliderAvg = Math.round(Object.values(dimScores).reduce((a, b) => a + b, 0) / 5);
  // Action worth 50%, sliders worth 50% — but sliders are secondary context
  const localScore = Math.max(20, Math.min(100, Math.round(aScore + sliderAvg * 0.5)));

  const verdict = (s: number) =>
    s >= 82 ? 'Strong balance' : s >= 62 ? 'Promising but exposed' : 'Needs tighter controls';

  const gaps = topGaps(profile, bp, idealAiCost);

  const localFallback = {
    score: localScore,
    verdict: verdict(localScore),
    coachNarrative: `You chose to ${action}; the recommended call was ${correctLabel}`,
    gaps,
    idealAction: scenario.correctOption,
  };

  if (!process.env.GROQ_API_KEY) {
    return Response.json({ mode: 'local-fallback', ...localFallback });
  }

  // ── Groq prompt ───────────────────────────────────────────────────────────
  const gapSummary = gaps.length
    ? gaps.map((g) => `${g.label}: yours ${g.user}, ideal ${g.ideal} (${g.direction})`).join('; ')
    : 'all sliders were close to ideal';

  const prompt = `You are a sharp, direct business decision coach judging a hackathon challenge. Be concise — no filler, no bullet points.

SCENARIO: ${scenario.title}
Summary: ${scenario.summary}
Recommended action: ${scenario.correctOption}

PARTICIPANT (role: ${profile.role})
Chosen action: ${action}
Notable slider gaps vs ideal: ${gapSummary}

SCORING RULES — follow these exactly:
- Action choice is the PRIMARY judgment and worth ~50 of the 100 points.
  - Exact match = 50 pts, partial/adjacent = 20-35 pts, wrong = 0 pts
- Slider alignment is secondary context, worth the remaining ~50 pts spread across 5 dimensions.
  - Small gaps (≤15 pts off) should still score 75-85 on that dimension.
- A correct action with minor slider gaps should score 72-88 overall.
- Only score below 55 if both the action AND sliders are significantly wrong.

Return ONLY valid JSON — no markdown, no extra keys:
{
  "score": <integer 0-100, following the rules above>,
  "verdict": <exactly one of: "Strong balance" | "Promising but exposed" | "Needs tighter controls">,
  "coachNarrative": "<2-3 sentences MAX. Never start with 'You chose' or 'Your action was' — lead immediately with the insight. Cover: was the action right or wrong and the single most important reason why, then the one key slider gap and its real implication. Hard limit: 45 words. If you exceed 45 words, rewrite shorter.>"
}`;

  try {
    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.35,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}`);

    const groqData = await res.json();
    const raw = groqData.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw);

    return Response.json({
      score:           parsed.score           ?? localScore,
      verdict:         parsed.verdict         ?? verdict(localScore),
      coachNarrative:  parsed.coachNarrative  ?? localFallback.coachNarrative,
      gaps,
      idealAction:     scenario.correctOption,
    });

  } catch (err) {
    console.error('Scoring error, using local fallback:', err);
    return Response.json({ mode: 'local-fallback', ...localFallback });
  }
}
