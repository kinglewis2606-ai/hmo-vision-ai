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

  return (
    <div>
      <div className="flex gap-6">
        {/* Left: Original uploaded floor plan */}
        <div className="w-1/2 bg-white rounded shadow p-4">
          <h2 className="text-lg font-semibold mb-2">Uploaded Floor Plan</h2>
          <div className="border rounded p-2 flex items-center justify-center">
            <img
              src={uploadsUrl}
              alt="Uploaded floor plan"
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
            />
          </div>
        </div>

        {/* Right: AI Proposed Layout */}
        <div className="w-1/2 bg-white rounded shadow p-4">
          <div className="flex justify-between items-start">
            <h2 className="text-lg font-semibold mb-2">Proposed HMO Layout</h2>
            <button
              onClick={generateLayout}
              className="bg-slate-900 text-white px-3 py-1 rounded text-sm"
              disabled={loading}
            >
              {loading ? "Generating…" : "Regenerate"}
            </button>
          </div>

          <div className="border rounded p-2 mb-4 flex items-center justify-center" style={{ minHeight: 240 }}>
            {loading && (
              <p className="text-sm text-gray-600">Generating proposed HMO layout...</p>
            )}

            {!loading && svg && (
              // Render SVG as an <img> data URL to avoid injecting markup directly
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
                alt="Proposed HMO layout"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain" }}
              />
            )}

            {!loading && !svg && !error && (
              <p className="text-sm text-gray-600">No proposed layout yet.</p>
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
