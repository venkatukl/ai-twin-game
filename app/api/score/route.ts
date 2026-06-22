import { GoogleGenAI } from '@google/genai';
import scenarios from '@/data/scenarios.json';

export async function POST(req: Request) {
  const body = await req.json();
  const scenario = scenarios.find((item) => item.id === body.scenarioId);

  if (!scenario) {
    return Response.json({ error: 'Invalid scenario id' }, { status: 404 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({
      mode: 'local-fallback',
      score: 78,
      verdict: 'Strong balance',
      dimensions: {
        riskCalibration: 76,
        complianceAlignment: 84,
        growthJudgment: 74,
        aiGovernance: 77
      },
      rationale: 'Set GEMINI_API_KEY in Vercel or .env.local to enable live Gemini judging.'
    });
  }

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
  });

  const prompt = `You are an objective hackathon judge. Score this response as JSON only.
Scenario: ${JSON.stringify(scenario)}
Participant profile: ${JSON.stringify(body.profile)}
Decision: ${body.action}
Reasoning: ${body.reason}

Return JSON with keys:
score,
verdict,
dimensions { riskCalibration, complianceAlignment, growthJudgment, aiGovernance },
rationale,
improvementTip`;

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json'
    }
  });

  const text = response.text || '{}';

  return new Response(text, {
    headers: {
      'content-type': 'application/json'
    }
  });
}