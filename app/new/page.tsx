"use client";

import FloorPlanOverlay, { type Box } from "@/components/FloorPlanOverlay";
import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);

  async function analyseFloorPlan() {
    if (!filename) {
      alert("Please upload a floor plan first.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename,
          address,
          propertyType,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        alert(data.error || "Analysis failed");
        setLoading(false);
        return;
      }

      const parsedReport =
        typeof data.result === "string"
          ? JSON.parse(
              data.result
                .replace(/^```json\s*/, "")
                .replace(/\s*```$/, "")
            )
          : data.result;

      setReport(parsedReport);
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">New Project</h1>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block mb-2">Address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          />

          <label className="block mb-2">Property Type</label>
          <select
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
            className="w-full p-2 border rounded mb-4"
          >
            <option>Semi Detached</option>
            <option>Terraced</option>
            <option>Detached</option>
            <option>Flat</option>
          </select>

          <UploadBox onUploaded={(name) => setFilename(name)} />

          <div className="mt-4">
            <button
              onClick={analyseFloorPlan}
              disabled={loading}
              className="bg-slate-900 text-white px-4 py-2 rounded"
            >
              {loading ? "Analysing…" : "Run Analysis"}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Preview / Results</h2>

          {filename ? (
            <>
              <p className="text-sm text-gray-600 mb-2">Uploaded file: {filename}</p>

              {report ? (
                <div>
                  <h3 className="font-medium">AI Summary</h3>
                  <pre className="text-xs bg-slate-100 p-3 rounded overflow-auto" style={{ maxHeight: 320 }}>
                    {JSON.stringify(report, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No report yet.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Upload a floor plan to begin.</p>
          )}
        </div>
      </div>
    </main>
  );
}
