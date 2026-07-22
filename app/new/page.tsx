"use client";

import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

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
        return;
      }

      setResult(data.result);
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-3xl mx-auto bg-zinc-900 rounded-xl shadow-xl p-8">

        <h1 className="text-4xl font-bold text-white mb-6">
          New Project
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
          className="w-full mt-6 rounded-lg bg-blue-600 py-4 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Analysing..." : "Analyse Floor Plan"}
        </button>

        {result && (
          <div className="mt-8 rounded-lg bg-black p-6">
            <h2 className="mb-4 text-xl font-bold text-white">
              AI Analysis
            </h2>

            <pre className="overflow-auto whitespace-pre-wrap text-green-400">
              {result}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}