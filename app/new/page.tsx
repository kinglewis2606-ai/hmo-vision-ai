"use client";

import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function analyseProject() {
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

      setResult(data.result);
    } catch (err) {
      console.error(err);
      alert("Something went wrong.");
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-xl mx-auto bg-zinc-900 rounded-xl shadow-xl p-8">

        <h1 className="text-4xl font-bold text-white mb-6">
          New Project
        </h1>

        <input
          className="w-full border rounded-lg p-3 mb-4"
          placeholder="Property Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <select
          className="w-full border rounded-lg p-3 mb-6"
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
          onClick={analyseProject}
          disabled={loading}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-4 font-bold"
        >
          {loading ? "Analysing..." : "Create Project"}
        </button>

        {result && (
          <pre className="mt-6 bg-black text-green-400 p-4 rounded-lg overflow-auto text-sm">
            {typeof result === "string"
              ? result
              : JSON.stringify(result, null, 2)}
          </pre>
        )}

      </div>
    </main>
  );
}