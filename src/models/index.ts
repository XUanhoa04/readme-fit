export type Category =
  | 'correctness'
  | 'completeness'
  | 'onboarding'
  | 'clarity'
  | 'impression'
  | 'visual-proof'
  | 'trust'
  | 'profile';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Confidence = 'high' | 'medium' | 'low';
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';
export type RuleStatus = 'pass' | 'fail' | 'not_applicable';

export type ProjectType =
  | 'cli'
  | 'library'
  | 'sdk'
  | 'api'
  | 'web-app'
  | 'desktop-app'
  | 'mobile-app'
  | 'developer-tool'
  | 'github-action'
  | 'vscode-extension'
  | 'ai-model'
  | 'ai-agent'
  | 'dataset'
  | 'template'
  | 'tutorial'
  | 'documentation'
  | 'infrastructure'
  | 'unknown';

export interface Evidence {
  type: string;
  message: string;
  path?: string;
  line?: number;
  value?: unknown;
}

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  priority: Priority;
  confidence: Confidence;
  title: string;
  source?: { path?: string; line?: number };
  observation: string;
  impact?: string;
  recommendation?: string;
  evidence: Evidence[];
  deterministic: boolean;
}

export interface ProjectProfile {
  primaryType: ProjectType;
  secondaryTypes: ProjectType[];
  languages: string[];
  packageManagers: string[];
  hasCli: boolean;
  hasWebUi: boolean;
  hasTests: boolean;
  hasLicense: boolean;
  entrypoints: string[];
  packageName?: string;
  confidence: number;
}

export interface MarkdownPosition {
  line: number;
  column: number;
  offset?: number;
}

export interface Heading {
  depth: number;
  text: string;
  line: number;
}

export interface CodeBlock {
  language?: string;
  value: string;
  line: number;
  section?: string;
}

export interface ReadmeLink {
  url: string;
  text: string;
  line: number;
  image: boolean;
  html: boolean;
}

export interface ReadmeSection {
  heading: Heading;
  endLine: number;
  wordCount: number;
}

export interface ReadmeDocument {
  path: string;
  raw: string;
  lineCount: number;
  wordCount: number;
  headings: Heading[];
  sections: ReadmeSection[];
  codeBlocks: CodeBlock[];
  links: ReadmeLink[];
  images: ReadmeLink[];
  htmlBlocks: Array<{ value: string; line: number }>;
  lists: number;
  tables: number;
  blockquotes: number;
  details: number;
}

export interface RepositorySnapshot {
  root: string;
  files: string[];
  packageJson?: Record<string, unknown>;
  pyproject?: string;
  cargoToml?: string;
  goMod?: string;
  nvmrc?: string;
  nodeVersion?: string;
  pythonVersion?: string;
  licenseText?: string;
}

export interface RuleScore {
  id: string;
  status: RuleStatus;
  weight: number;
  earned: number;
  explanation: string;
}

export interface CategoryScore {
  category: Category;
  score: number | null;
  maxScore: 100;
  rules: RuleScore[];
}

export interface AnalysisReport {
  schemaVersion: 1;
  generatedAt: string;
  project: ProjectProfile;
  readme: { path: string; lines: number; words: number };
  scores: Partial<Record<Category, CategoryScore>>;
  overall: number;
  findings: Finding[];
  facts: Record<string, unknown>;
  coverage: {
    verified: string[];
    inferred: string[];
    notChecked: string[];
  };
  limitations: string[];
}

export type ProfileCategory =
  | 'positioning'
  | 'proof-of-work'
  | 'project-selection'
  | 'scanability'
  | 'technical-narrative'
  | 'contact';

export interface PublicRepository {
  name: string;
  description: string | null;
  url: string;
  language: string | null;
  topics: string[];
  stars: number;
  fork: boolean;
  archived: boolean;
  updatedAt: string;
}

export interface PublicProfileData {
  login: string;
  name: string | null;
  bio: string | null;
  url: string;
  blog: string | null;
  company: string | null;
  location: string | null;
  publicRepos: number;
  followers: number;
  profileReadme: string | null;
  repositories: PublicRepository[];
}

export interface ProfileScore {
  category: ProfileCategory;
  score: number;
  maxScore: number;
  rules: RuleScore[];
}

export interface ProfileReport {
  schemaVersion: 1;
  generatedAt: string;
  user: { login: string; name: string | null; url: string };
  scores: Record<ProfileCategory, ProfileScore>;
  total: number;
  findings: Finding[];
  facts: Record<string, unknown>;
  limitations: string[];
  disclaimer: string;
}
