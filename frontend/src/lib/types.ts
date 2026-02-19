export interface TailorRequest {
  jd_text: string;
  job_title?: string;
  company_name?: string;
  resume_file: File;
}

export interface ExtractedKeywords {
  languages: string[];
  backend: string[];
  frontend: string[];
  ai_llm: string[];
  databases: string[];
  devops: string[];
  soft_skills: string[];
  domains: string[];
  role_title: string;
  experience_level: string;
}

export interface MatchResult {
  matched: Record<string, string[]>;
  missing_from_resume: Record<string, string[]>;
  injectable: Record<string, string[]>;
  total_jd_keywords: number;
  total_matched: number;
  match_score: number;
  dominant_category: string;
}

export interface ReorderPlan {
  skills_category_order: string[];
  project_order: string[];
  summary_first_line: string;
  experience_emphasis: Record<string, string[]>;
}

export interface TailorResponse {
  extracted: ExtractedKeywords;
  match: MatchResult;
  reorder_plan: ReorderPlan;
  pdf_url: string;
  pdf_b64: string;
  pdf_error: string;
  tex_content: string;
  tex_diff: string;
  filename: string;
  processing_time_ms: number;
}
