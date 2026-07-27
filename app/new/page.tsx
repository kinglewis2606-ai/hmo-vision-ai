"use client";

import FloorPlanOverLay from "@/components/FloorPlanOverlay";
import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
const testBoxes = [
  {
    label: "Bedroom 1",
    x: 140,
    y: 120,
    width: 180,
    height: 120,
  },
  {
    label: "Kitchen",
    x: 380,
    y: 300,
    width: 220,
    height: 160,
    colour: "rgba(34,197,94,0.35)",
  },
];
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

setReport(data.result);

      } catch (err) {
  console.error("Analyse error:", err);

  if (err instanceof Error) {
    alert(err.message);
  } else {
    alert(JSON.stringify(err));
  }
    } finally {
  setLoading(false);
}
  }
  return (
    <main className="min-h-screen bg-slate-900 p-8">
      <div className="max-w-5xl mx-auto">

        <div className="bg-zinc-900 rounded-xl p-8 shadow-xl">
<div className="grid gap-4 md:grid-cols-4 mb-8">

  <div className="rounded-xl bg-slate-800 p-5">
    <div className="text-sm text-slate-400">AI Analysis</div>
    <div className="mt-2 text-2xl font-bold text-white">60 sec</div>
  </div>

  <div className="rounded-xl bg-slate-800 p-5">
    <div className="text-sm text-slate-400">Supported Files</div>
    <div className="mt-2 text-2xl font-bold text-white">
      PDF • JPG
    </div>
  </div>

  <div className="rounded-xl bg-slate-800 p-5">
    <div className="text-sm text-slate-400">Outputs</div>
    <div className="mt-2 text-2xl font-bold text-white">
      Report + ROI
    </div>
  </div>
  <div className="rounded-xl bg-slate-800 p-5">
    <div className="text-sm text-slate-400">Purpose</div>
    <div className="mt-2 text-2xl font-bold text-white">
      HMO Ready
    </div>
  </div>

</div>
          <div className="mb-8">
  <span className="inline-block rounded-full bg-blue-600/20 px-3 py-1 text-sm font-semibold text-blue-300">
    HMO Vision AI
  </span>

  <h1 className="mt-4 text-5xl font-bold text-white">
    Analyse a Property in Under 60 Seconds
  </h1>

  <p className="mt-4 max-w-2xl text-lg text-slate-300">
    Upload a floor plan and instantly receive an AI-powered HMO assessment,
    investor snapshot, compliance review and estimated rental potential.
  </p>
</div>

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

         <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
  <h3 className="mb-2 text-xl font-bold">
    📐 Upload Floor Plan
  </h3>

  <p className="mb-4 text-sm text-slate-600">
    Upload a PDF, JPG or PNG floor plan to begin the AI analysis.
  </p>

  <UploadBox
  onUploaded={(filename, imageUrl) => {
    setFilename(filename);
    setImageUrl(imageUrl);
  }}
/>

  {filename && (
    <div className="mt-4 rounded-lg bg-green-50 p-3 text-green-700">
      ✅ Uploaded: {filename}
    </div>
  )}
           {imageUrl && (
  <div className="mt-6">
    <FloorPlanOverlay
      imageUrl={imageUrl}
      boxes={testBoxes}
    />
  </div>
)}
</div>
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

            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

  <div>
    <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
      ✓ Analysis Complete
    </span>

    <h2 className="mt-3 text-4xl font-bold">
      HMO Assessment Report
    </h2>

    <p className="mt-2 text-slate-600">
      AI-generated investment summary based on your uploaded floor plan.
    </p>
  </div>

  <div className="rounded-xl bg-blue-600 px-6 py-5 text-center text-white shadow-lg">
    <div className="text-sm opacity-80">
      HMO Score
    </div>

    <div className="text-5xl font-bold">
      {report.hmoScore}/100
    </div>
  </div>

              <div className="mt-6 rounded-xl border-2 border-green-200 bg-green-50 p-6">

  <div className="text-center">

    <div className="text-sm font-semibold uppercase tracking-widest text-green-700">
      Investment Verdict
    </div>

    <div className="mt-3 inline-block rounded-full bg-green-600 px-6 py-3 text-3xl font-bold text-white shadow-lg">
      {report.verdict}
    </div>

  </div>

  <p className="mt-6 text-lg leading-8 text-slate-800">
    {report.investorSummary}
  </p>

</div>
</div>

            <div className="grid md:grid-cols-2 gap-6">

              <div className="border rounded-lg p-6 bg-slate-50">
  <h3 className="font-bold text-2xl mb-5">
    📊 Investor Snapshot
  </h3>

  <div className="space-y-3">

    <div className="flex justify-between">
      <span>Current Bedrooms</span>
      <strong>{report.summary.bedrooms}</strong>
    </div>

    <div className="flex justify-between">
      <span>Bathrooms</span>
      <strong>{report.summary.bathrooms}</strong>
    </div>

    <div className="flex justify-between">
      <span>Potential HMO Rooms</span>
      <strong>{report.summary.possibleHMOBedrooms}</strong>
    </div>

    <hr />

    <div className="flex justify-between">
      <span>Monthly Rent</span>
      <strong>
        £{report.estimatedMonthlyRent.toLocaleString()}
      </strong>
    </div>

    <div className="flex justify-between">
      <span>Annual Rent</span>
      <strong>
        £{(report.estimatedMonthlyRent * 12).toLocaleString()}
      </strong>
    </div>

    <div className="flex justify-between">
      <span>Conversion Cost</span>
      <strong>
        £{report.estimatedConversionCost.low.toLocaleString()} -
        £{report.estimatedConversionCost.high.toLocaleString()}
      </strong>
    </div>

    <div className="flex justify-between">
      <span>Confidence</span>
      <strong>{report.summary.confidence}</strong>
    </div>

  </div>
</div>

         <div className="border rounded-lg p-6 bg-slate-50">
  <h3 className="font-bold text-2xl mb-5">
    🏠 Proposed Room Layout
  </h3>

  <div className="space-y-4">
    {report.recommendedLayout.map((room: string, i: number) => (
      <div
        key={i}
        className="rounded-lg border border-slate-700 bg-slate-800 p-4"
      >
        <div className="font-semibold text-blue-400 mb-2">
          Step {i + 1}
        </div>

        <p className="text-slate-200 leading-7 whitespace-pre-wrap">
          {room}
        </p>
      </div>
    ))}
  </div>
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

              

            </div>

          </div>
        )}

      </div>
    </main>
  );
}
