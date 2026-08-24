import type {
  Category,
  EvidenceGraph,
  Finding,
  ProjectProfile,
  ReadmeDocument,
  RepositorySnapshot,
  RuleScore,
} from '../models/index.js';
import type { ReadmeFitConfig } from '../core/config/config.js';

export interface AnalysisContext {
  repository: RepositorySnapshot;
  readme: ReadmeDocument;
  project: ProjectProfile;
  config: ReadmeFitConfig;
  options: {
    checkLinks: boolean;
  };
  evidenceGraph: EvidenceGraph;
}

export interface RuleResult {
  score: RuleScore;
  findings: Finding[];
  facts?: Record<string, unknown>;
}

export interface Rule {
  id: string;
  category: Category;
  description: string;
  applies(context: AnalysisContext): boolean;
  evaluate(context: AnalysisContext): Promise<RuleResult> | RuleResult;
}
