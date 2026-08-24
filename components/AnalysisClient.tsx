"use client";

import { useEffect, useState } from "react";

export default function AnalysisClient({ filename }: { filename: string }) {
  const [loading, setLoading] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadsUrl = `/api/uploads/${encodeURIComponent(filename)}`;

  async function generateLayout() {
    setLoading(true);
    setError(null);
    setSvg(null);

    try {
      const res = await fetch(`/api/generate-layout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error || "Generation failed");
        setAnalysis(data.analysis ?? null);
      } else {
        setSvg(data.svg ?? null);
        setAnalysis(data.analysis ?? null);
      }
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (filename) generateLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename]);

  const proposedSrc = svg
    ? svg.startsWith("data:image/")
      ? svg
      : `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    : null;

  return (
    <div>
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Left: original source drawing — never modified */}
        <div className="w-full lg:w-1/2 bg-white rounded shadow p-4">
          <h2 className="text-lg font-semibold mb-2">Original Floor Plan</h2>
          <div className="border rounded p-2 flex items-center justify-center bg-white">
            <img
              src={uploadsUrl}
              alt="Original uploaded floor plan"
              style={{ width: "100%", maxHeight: "70vh", objectFit: "contain" }}
            />
          </div>
        </div>

        {/* Right: source-locked architectural proposal */}
        <div className="w-full lg:w-1/2 bg-white rounded shadow p-4">
          <div className="flex justify-between items-start">
            <h2 className="text-lg font-semibold mb-2">Proposed HMO Blueprint</h2>
            <button
              onClick={generateLayout}
              className="bg-slate-900 text-white px-3 py-1 rounded text-sm"
              disabled={loading}
            >
              {loading ? "Generating…" : "Regenerate"}
            </button>
          </div>

          <div className="border rounded p-2 mb-4 flex items-center justify-center bg-white" style={{ minHeight: 240 }}>
            {loading && (
              <p className="text-sm text-gray-600">Generating source-locked proposed blueprint...</p>
            )}

            {!loading && proposedSrc && (
              <img
                src={proposedSrc}
                alt="Proposed HMO blueprint"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain" }}
              />
            )}

            {!loading && !proposedSrc && !error && (
              <p className="text-sm text-gray-600">No proposed blueprint yet.</p>
            )}

            {!loading && error && (
              <p className="text-sm text-red-600">Error: {error}</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold">AI Analysis (JSON)</h3>
            {analysis ? (
              <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto" style={{ maxHeight: "30vh" }}>
                {JSON.stringify(analysis, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">Analysis not available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
