"use client";

import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function TargetedHMOPage() {
  const [filename, setFilename] = useState("");
  const [targetBedrooms, setTargetBedrooms] = useState("6");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");

  async function generate() {
    if (!filename) { setError("Please upload a floor plan first."); return; }
    setLoading(true); setError(""); setReport(null);
    try {
      const res = await fetch("/api/analyse-targeted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, targetBedrooms: Number(targetBedrooms), address, propertyType }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Analysis failed.");
      setReport(data.result);
    } catch (e: any) { setError(e?.message || "Analysis failed."); }
    finally { setLoading(false); }
  }

  const actual = Number(report?.geometryFeasibility?.proposedBedrooms || 0);
  const target = Number(report?.requestedBedrooms || targetBedrooms);
  const ensuites = Number(report?.geometryFeasibility?.proposedEnsuites || 0);
  const image = filename ? `/api/uploads/${encodeURIComponent(filename)}` : "";

  return (
    <main className="min-h-screen bg-[#07101a] px-3 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-slate-800 bg-[#0a1520] p-4 shadow-2xl sm:p-6 lg:p-8">
          <span className="inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">HMO Vision AI — Targeted Design</span>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Create the HMO you want</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Upload the original plan, choose the target number of HMO bedrooms, and let the AI design the proposed layout inside the existing footprint.</p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <input className="rounded-lg border border-slate-700 bg-white p-3 text-black" placeholder="Property Address" value={address} onChange={e => setAddress(e.target.value)} />
            <select className="rounded-lg border border-slate-700 bg-white p-3 text-black" value={propertyType} onChange={e => setPropertyType(e.target.value)}>
              <option>Detached</option><option>Semi Detached</option><option>Terraced</option><option>Flat</option><option>Bungalow</option>
            </select>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-cyan-300">Target HMO Bedrooms</label>
              <select className="w-full rounded-lg border border-cyan-500/40 bg-white p-3 font-bold text-black" value={targetBedrooms} onChange={e => setTargetBedrooms(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} bedroom{n === 1 ? "" : "s"}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-slate-600 bg-[#0d1924] p-4">
            <h2 className="font-bold text-white">📐 Upload Floor Plan</h2>
            <p className="mt-1 text-xs text-slate-500">The external footprint is treated as fixed.</p>
            <div className="mt-3"><UploadBox onUploaded={name => setFilename(name)} /></div>
            {filename && <div className="mt-3 rounded-lg bg-emerald-500/10 p-2 text-xs font-medium text-emerald-300">✓ {filename}</div>}
          </div>

          <button onClick={generate} disabled={loading} className="mt-4 w-full rounded-xl bg-cyan-600 py-4 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-60">
            {loading ? "AI is designing and validating the layout…" : `Create ${targetBedrooms}-Bedroom HMO Layout`}
          </button>
          {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        </section>

        {report && (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-[#07131d] p-4 shadow-2xl sm:p-6 lg:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-emerald-300">✓ Design complete</div>
                <h2 className="mt-2 text-3xl font-bold text-white">Proposed HMO Layout</h2>
                <p className="mt-1 text-sm text-slate-400">Requested: <strong className="text-white">{target}</strong> bedrooms · Physically achieved: <strong className={actual === target ? "text-emerald-300" : "text-amber-300"}>{actual}</strong> · Private ensuites: <strong className="text-white">{ensuites}</strong></p>
              </div>
              <div className={`rounded-xl px-5 py-3 text-center ${actual === target ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
                <div className="text-xs font-bold uppercase tracking-wider">Geometry result</div>
                <div className="text-2xl font-black">{actual}/{target}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 font-bold text-white">Original Floor Plan</h3>
                <div className="overflow-hidden rounded-xl border border-slate-700 bg-white"><img src={image} alt="Original floor plan" className="h-auto w-full object-contain" /></div>
              </div>
              <div>
                <h3 className="mb-2 font-bold text-white">Proposed HMO Layout</h3>
                <div className="overflow-hidden rounded-xl border border-slate-700 bg-white">
                  {report.generatedLayoutImage ? <img src={report.generatedLayoutImage} alt="Proposed HMO layout" className="h-auto w-full object-contain" /> : <div className="p-8 text-center text-slate-500">No rendered layout was returned.</div>}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4"><div className="text-xs text-slate-500">Requested</div><div className="mt-1 text-2xl font-black text-white">{target} bedrooms</div></div>
              <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4"><div className="text-xs text-slate-500">Geometry achieved</div><div className="mt-1 text-2xl font-black text-emerald-300">{actual} bedrooms</div></div>
              <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4"><div className="text-xs text-slate-500">Private ensuites</div><div className="mt-1 text-2xl font-black text-white">{ensuites}</div></div>
            </div>

            {report.verdict && <div className="mt-5 rounded-xl border border-slate-700 bg-[#0c1924] p-4 text-sm leading-6 text-slate-300">{report.verdict}</div>}
            {Array.isArray(report.rejectedChanges) && report.rejectedChanges.length > 0 && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"><strong>Rejected geometry:</strong> {report.rejectedChanges.length} proposed change(s) were not physically valid and were excluded from the final drawing.</div>}
          </section>
        )}
      </div>
    </main>
  );
}
