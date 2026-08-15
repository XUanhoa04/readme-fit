import type { AnalysisReport } from '../models/index.js';

export function renderJson(report: AnalysisReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
