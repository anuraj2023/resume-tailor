"use client";

import { TailorResponse } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { MatchScore } from "./match-score";
import { KeywordChips } from "./keyword-chips";
import { ReorderInfo } from "./reorder-info";
import { DiffView } from "./diff-view";
import { DownloadButton } from "./download-button";

interface ResultsPanelProps {
  result: TailorResponse;
  companyName?: string;
}

export function ResultsPanel({ result, companyName }: ResultsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Header with score and download */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {result.extracted.role_title || "Resume Tailored"}
          </h2>
          {result.extracted.experience_level && (
            <p className="text-sm text-gray-500 mt-1">
              Experience: {result.extracted.experience_level}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Processed in {formatDuration(result.processing_time_ms)}
          </p>
        </div>
        <MatchScore
          score={result.match.match_score}
          totalMatched={result.match.total_matched}
          totalKeywords={result.match.total_jd_keywords}
        />
      </div>

      {/* Download buttons */}
      <DownloadButton
        pdfB64={result.pdf_b64}
        pdfError={result.pdf_error}
        texContent={result.tex_content}
        filename={result.filename}
        companyName={companyName}
      />

      {/* Keyword analysis */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Keyword Analysis</h3>
        <KeywordChips
          matched={result.match.matched}
          missing={result.match.missing_from_resume}
          injectable={result.match.injectable}
        />
      </div>

      {/* Reorder plan */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <ReorderInfo plan={result.reorder_plan} />
      </div>

      {/* Diff view */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <DiffView diff={result.tex_diff} />
      </div>
    </div>
  );
}
