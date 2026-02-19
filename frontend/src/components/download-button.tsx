"use client";

import JSZip from "jszip";

interface DownloadButtonProps {
  pdfB64: string;
  pdfError: string;
  texContent: string;
  filename: string;
  companyName?: string;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function b64ToBlob(b64: string, mime: string): Blob {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Blob([buf], { type: mime });
}

export function DownloadButton({ pdfB64, pdfError, texContent, filename, companyName }: DownloadButtonProps) {
  const hasPdf = pdfB64.length > 0;
  const hasTex = texContent.length > 0;

  const downloadPdf = () => {
    triggerDownload(b64ToBlob(pdfB64, "application/pdf"), `${filename}.pdf`);
  };

  const downloadTex = () => {
    triggerDownload(new Blob([texContent], { type: "text/plain" }), `${filename}.tex`);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    if (hasPdf) zip.file(`${filename}.pdf`, b64ToBlob(pdfB64, "application/pdf"));
    if (hasTex) zip.file(`${filename}.tex`, texContent);
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, `${filename}.zip`);
  };

  const btnBase = "inline-flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl shadow-sm hover:shadow transition-all text-sm";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {hasPdf && (
          <button onClick={downloadPdf} className={`${btnBase} bg-green-600 hover:bg-green-700 text-white`}>
            <DownloadIcon />
            PDF
            {companyName && <span className="text-green-100">({companyName})</span>}
          </button>
        )}
        {hasTex && (
          <button onClick={downloadTex} className={`${btnBase} bg-blue-600 hover:bg-blue-700 text-white`}>
            <DownloadIcon />
            LaTeX
          </button>
        )}
        {hasPdf && hasTex && (
          <button onClick={downloadZip} className={`${btnBase} bg-purple-600 hover:bg-purple-700 text-white`}>
            <ZipIcon />
            ZIP
          </button>
        )}
      </div>
      {!hasPdf && pdfError && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <span className="font-medium">PDF unavailable:</span> {pdfError}
        </p>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ZipIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}
