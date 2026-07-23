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

      if (!data.success) {
        alert(data.error || "Analysis failed");
        return;
      }

      setReport(JSON.parse(data.result));
    } catch (err) {
      console.error(err);
      alert("Unable to analyse floor plan.");
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
            className="w-full mt-6 rounded-lg bg-blue-600 py-4 text-white font-bold hover:bg-blue-700"
          >
            {loading ? "Analysing..." : "Analyse Floor Plan"}
          </button>
        </div>

        {report && (
          <div className="mt-8 bg-white rounded-xl shadow-xl p-8">

            <h2 className="text-3xl font-bold mb-6">
              HMO Assessment Report
            </h2>

            <div className="grid md:grid-cols-2 gap-6">

              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-xl mb-3">
                  Property Summary
                </h3>

                <p>Bedrooms: {report.summary.bedrooms}</p>
                <p>Bathrooms: {report.summary.bathrooms}</p>
                <p>Kitchen: {report.summary.kitchen ? "Yes" : "No"}</p>
                <p>Living Room: {report.summary.livingRoom ? "Yes" : "No"}</p>
                <p>Possible HMO Bedrooms: {report.summary.possibleHMOBedrooms}</p>
                <p>Confidence: {report.summary.confidence}</p>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-xl mb-3">
                  Overall Score
                </h3>

                <div className="text-6xl font-bold text-blue-600">
                  {report.hmoScore}/100
                </div>

                <p className="mt-4">
                  {report.verdict}
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-xl mb-3">
                  Recommendations
                </h3>

                <ul className="list-disc pl-5">
                  {report.recommendations.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-xl mb-3">
                  Compliance
                </h3>

                <ul className="list-disc pl-5">
                  {report.compliance.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-xl mb-3">
                  Estimated Conversion Cost
                </h3>

                <p>
                  £{report.estimatedConversionCost.low.toLocaleString()} -
                  £{report.estimatedConversionCost.high.toLocaleString()}
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <h3 className="font-bold text-xl mb-3">
                  Estimated Monthly Rent
                </h3>

                <p>
                  £{report.estimatedMonthlyRent.toLocaleString()}
                </p>
              </div>

            </div>

          </div>
        )}

      </div>
    </main>
  );
}