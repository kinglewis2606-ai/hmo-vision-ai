"use client";

import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

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

      console.log("Analyse response:", data);

      if (!res.ok) {
        alert(`HTTP ${res.status}\n\n${JSON.stringify(data, null, 2)}`);
        return;
      }

      if (!data.success) {
        alert(data.error || "Analysis failed");
        return;
      }

      // Backend already returns parsed JSON
      setReport(data.result);
    } catch (err: any) {
      console.error("Request Error:", err);

      alert(err?.message || "Unable to analyse floor plan.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-5xl mx-auto">

        <div className="bg-zinc-900 rounded-xl p-8 shadow-xl">

          <h1 className="text-4xl font-bold text-white mb-6">
            New HMO Project
          </h1>

          <input
            className="w-full rounded-lg p-3 mb-4 text-black"
            placeholder="Property Address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <select
            className="w-full rounded-lg p-3 mb-6 text-black"
            value={propertyType}
            onChange={(e) => setPropertyType(e.target.value)}
          >
            <option>Detached</option>
            <option>Semi Detached</option>
            <option>Terraced</option>
            <option>Flat</option>
            <option>Bungalow</option>
          </select>

          <UploadBox onUploaded={setFilename} />

          <button
            onClick={analyseFloorPlan}
            disabled={loading}
            className="w-full mt-6 rounded-lg bg-blue-600 py-4 text-white font-bold hover:bg-blue-700 disabled:bg-gray-500"
          >
            {loading ? "Analysing..." : "Analyse Floor Plan"}
          </button>
        </div>

        {report && (
          <div className="mt-8 bg-white rounded-xl shadow-xl p-8">

            <h2 className="text-3xl font-bold mb-6">
              HMO Assessment Report
            </h2>

            <pre className="bg-slate-100 rounded-lg p-4 overflow-auto text-sm">
              {JSON.stringify(report, null, 2)}
            </pre>

          </div>
        )}
      </div>
    </main>
  );
}
