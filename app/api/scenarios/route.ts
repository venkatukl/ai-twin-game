import scenarios from '@/data/scenarios.json';

export async function GET() {
  return Response.json({ scenarios, total: scenarios.length });
}