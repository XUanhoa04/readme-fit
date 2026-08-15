import type {
  Category,
  Confidence,
  Evidence,
  Finding,
  Priority,
  Severity,
} from '../models/index.js';

export function finding(input: {
  id: string;
  category: Category;
  severity: Severity;
  priority: Priority;
  title: string;
  observation: string;
  evidence: Evidence[];
  confidence?: Confidence;
  deterministic?: boolean;
  source?: { path?: string; line?: number };
  impact?: string;
  recommendation?: string;
}): Finding {
  const result: Finding = {
    id: input.id,
    category: input.category,
    severity: input.severity,
    priority: input.priority,
    confidence: input.confidence ?? 'high',
    title: input.title,
    observation: input.observation,
    evidence: input.evidence,
    deterministic: input.deterministic ?? true,
  };
  if (input.source) result.source = input.source;
  if (input.impact) result.impact = input.impact;
  if (input.recommendation) result.recommendation = input.recommendation;
  return result;
}

export function passScore(id: string, weight: number, explanation: string) {
  return { id, status: 'pass' as const, weight, earned: weight, explanation };
}

export function failScore(id: string, weight: number, earned: number, explanation: string) {
  return { id, status: 'fail' as const, weight, earned, explanation };
}

export function naScore(id: string, explanation: string) {
  return { id, status: 'not_applicable' as const, weight: 0, earned: 0, explanation };
}
