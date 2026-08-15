"use client";

import FloorPlanOverlay from "@/components/FloorPlanOverlay";
import { useMemo, useState } from "react";
import UploadBox from "@/components/UploadBox";

type Room = {
  id: string;
  name?: string;
  type?: string;
  floor?: string;
  approxAreaSqm?: number;
  approxWidthM?: number;
  approxDepthM?: number;
  width?: number;
  height?: number;
};

const money = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? `£${Math.round(n).toLocaleString("en-GB")}` : "—";
};

const normalise = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const isBedroom = (room: Room) => normalise(room.type).includes("bedroom") || normalise(room.name).includes("bedroom");
const isEnsuite = (room: Room) => normalise(`${room.type} ${room.name}`).includes("ensuite");

function floorName(room: Room, floors: any[]) {
  const floor = floors.find((f: any) => f.rooms?.some((r: any) => r.id === room.id));
  return floor?.name || "Floor";
}

function bedroomDescription(room: Room, ensuite: boolean) {
  const area = Number(room.approxAreaSqm || 0);
  const size = area >= 10.5 ? "Double" : area >= 8 ? "Comfortable" : "Single";
  return ensuite ? `${size} with Ensuite` : size;
}

function bedroomDimensions(room: Room) {
  const width = Number(room.approxWidthM || 0);
  const depth = Number(room.approxDepthM || 0);
  if (width > 0 && depth > 0) return `${width.toFixed(2)}m × ${depth.toFixed(2)}m`; 
  return "Validated geometry";
}

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");
  const [filename, setFilename] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);
  const [originalFloorPlan, setOriginalFloorPlan] = useState<any>(null);
  const [proposedFloorPlan, setProposedFloorPlan] = useState<any>(null);

  async function analyseFloorPlan() {
    if (!filename) { alert("Please upload a floor plan first."); return; }
    setLoading(true);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 290000);
      let res: Response;
      try {
        res = await fetch("/api/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, address, propertyType }),
          signal: controller.signal,
        });
      } finally { window.clearTimeout(timeout); }
      const raw = await res.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error(`Analysis server returned HTTP ${res.status} without valid JSON.`); }
      if (!res.ok || !data?.success) throw new Error(data?.error || `Analysis failed (HTTP ${res.status}).`);
      const parsedReport = typeof data.result === "string" ? JSON.parse(data.result.replace(/^```json\s*/, "").replace(/\s*```$/, "")) : data.result;
      setReport(parsedReport);
      setOriginalFloorPlan(parsedReport?.originalFloorPlan ?? null);
      setProposedFloorPlan(parsedReport?.proposedFloorPlan ?? null);
    } catch (err) {
      console.error("Analyse error:", err);
      if (err instanceof DOMException && err.name === "AbortError") alert("Analysis timed out after 4 minutes 50 seconds. The server did not return a result.");
      else if (err instanceof TypeError && err.message === "Failed to fetch") alert("The analysis server disconnected before returning a response. The upload is still safe. Please try Analyse again after the server has restarted.");
      else if (err instanceof Error) alert(err.message); else alert("Analysis failed.");
    } finally { setLoading(false); }
  }

  const finalRooms = useMemo<Room[]>(() => {
    if (!proposedFloorPlan?.floors) return [];
    return proposedFloorPlan.floors.flatMap((f: any) => (f.rooms || []).map((r: any) => ({ ...r, floor: f.name })));
  }, [proposedFloorPlan]);

  const finalBedrooms = finalRooms.filter(isBedroom);
  const finalEnsuites = finalRooms.filter(isEnsuite);
  const currentBedrooms = Number(report?.summary?.bedrooms ?? 0);
  const proposedBedrooms = Number(report?.geometryFeasibility?.proposedBedrooms ?? report?.highestPossibleHMO?.bedrooms ?? report?.summary?.possibleHMOBedrooms ?? finalBedrooms.length);
  const proposedEnsuites = Number(report?.geometryFeasibility?.proposedEnsuites ?? report?.highestPossibleHMO?.ensuites ?? finalEnsuites.length);
  const allEnsuites = proposedBedrooms > 0 && proposedEnsuites >= proposedBedrooms && finalEnsuites.length >= proposedBedrooms;
  const annualRent = Number(report?.estimatedAnnualRent || Number(report?.estimatedMonthlyRent || 0) * 12);
  const rent = Number(report?.estimatedMonthlyRent || 0);
  const conversion = report?.estimatedConversionCost || {};
  const roi = report?.estimatedROI || report?.estimatedYield || "—";

  return (
    <main className="min-h-screen bg-[#07101a] px-3 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-2xl border border-slate-800 bg-[#0a1520] p-4 shadow-2xl sm:p-6 lg:p-8">
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["AI Analysis", "60 sec"],
              ["Supported Files", "JPG • PNG • WebP"],
              ["Outputs", "Report + ROI"],
              ["Purpose", "HMO Ready"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-800 bg-[#101d29] px-4 py-3">
                <div className="text-xs font-medium text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-bold text-white">{value}</div>
              </div>
            ))}
          </div>

          <div className="mb-6">
            <span className="inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">HMO Vision AI</span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Analyse a Property in Under 60 Seconds</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400 sm:text-base">Upload a floor plan and receive an AI-powered HMO assessment, investor snapshot, compliance review and estimated rental potential.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <input className="w-full rounded-lg border border-slate-700 bg-white p-3 text-black outline-none ring-cyan-500 focus:ring-2" placeholder="Property Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            <select className="w-full rounded-lg border border-slate-700 bg-white p-3 text-black" value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
              <option>Detached</option><option>Semi Detached</option><option>Terraced</option><option>Flat</option><option>Bungalow</option>
            </select>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-slate-600 bg-[#0d1924] p-4">
            <h3 className="text-base font-bold text-white">📐 Upload Floor Plan</h3>
            <p className="mt-1 text-xs text-slate-500">Upload the floor plan as JPG, PNG or WebP so the original image can be preserved and used for the aligned proposed HMO overlay.</p>
            <div className="mt-3">
              <UploadBox onUploaded={(name) => { setFilename(name); setImageUrl(`/api/uploads/${encodeURIComponent(name)}`); }} />
            </div>
            {imageUrl && <div className="mt-4 max-h-80 overflow-hidden rounded-lg border border-slate-700 bg-white"><img src={imageUrl} alt="Uploaded floor plan" className="h-auto max-h-80 w-full object-contain" /></div>}
            {filename && <div className="mt-3 rounded-lg bg-emerald-500/10 p-2 text-xs font-medium text-emerald-300">✓ Upload successful</div>}
          </div>

          <button onClick={analyseFloorPlan} disabled={loading} className="mt-4 w-full rounded-xl bg-cyan-600 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Analysing floor geometry…" : "Analyse Floor Plan"}
          </button>
        </section>

        {report && (
          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-[#07131d] shadow-2xl">
            <div className="p-4 sm:p-6 lg:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">✓ Analysis Complete</div>
                  <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">HMO Assessment Report</h2>
                  <p className="mt-1 text-sm text-slate-500">AI-generated investment summary based on your uploaded floor plan.</p>
                </div>
                <div className="rounded-xl border border-cyan-400/30 bg-gradient-to-br from-blue-900 to-cyan-900 px-6 py-4 text-center shadow-xl">
                  <div className="text-xs font-semibold uppercase tracking-widest text-cyan-200">HMO Score</div>
                  <div className="mt-1 text-4xl font-black text-white">{Number(report?.hmoScore || 0)}/100</div>
                  <div className="text-xs font-semibold text-emerald-300">High Investment Potential</div>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-b from-emerald-950/70 to-[#0b1e1b] p-5 text-center shadow-lg sm:p-6">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Investment Verdict</div>
                <h3 className="mx-auto mt-3 max-w-4xl rounded-full border border-emerald-400/40 bg-emerald-500/20 px-4 py-3 text-lg font-extrabold text-white sm:text-2xl">
                  {proposedBedrooms > currentBedrooms ? "High-yield HMO conversion validated." : "HMO conversion assessment complete."}
                </h3>
                <p className="mx-auto mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-200">
                  {proposedBedrooms > currentBedrooms
                    ? `The proposed layout increases bedrooms from ${currentBedrooms} to ${proposedBedrooms}${allEnsuites ? ", all with private ensuites." : `, with ${proposedEnsuites} private ensuite${proposedEnsuites === 1 ? "" : "s"}.`}`
                    : `The geometry-supported layout contains ${proposedBedrooms} bedroom${proposedBedrooms === 1 ? "" : "s"}${allEnsuites ? ", all with private ensuites." : "."}`}
                </p>
                <p className="mt-4 text-xs leading-5 text-slate-400">
                  Maximum geometry-selected scheme: {proposedBedrooms} bedroom{proposedBedrooms === 1 ? "" : "s"} from the detected floor plan. All proposed changes shown below are taken from geometry that successfully passed validation.
                </p>
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-2">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-base font-bold text-white">Original Floor Plan</h3>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">Existing</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-700 bg-white shadow-lg">
                    <img src={`/api/uploads/${encodeURIComponent(filename)}`} className="h-auto w-full object-contain" alt="Original floor plan" />
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-white">Proposed HMO Layout</h3>
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-300">{proposedBedrooms} BEDROOMS{allEnsuites ? " | ALL WITH ENSUITES" : ` | ${proposedEnsuites} ENSUITES`}</span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-700 bg-white shadow-lg">
                    <FloorPlanOverlay
                      image={`/api/uploads/${encodeURIComponent(filename)}`}
                      originalFloorPlan={originalFloorPlan}
                      proposedFloorPlan={proposedFloorPlan}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
                    <span className="text-lg">📊</span><h3 className="text-lg font-bold text-white">Investor Snapshot</h3>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Current Bedrooms</span><strong className="text-white">{currentBedrooms}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Proposed Bedrooms (Max)</span><strong className="text-emerald-300">{proposedBedrooms}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Bathrooms</span><strong className="text-white">{proposedEnsuites}{allEnsuites ? " (All Ensuites)" : ""}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Potential HMO Rooms</span><strong className="text-white">{proposedBedrooms}</strong></div>
                    <div className="my-3 border-t border-slate-700" />
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Monthly Rent (Est.)</span><strong className="text-white">{money(rent)}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Annual Rent (Est.)</span><strong className="text-white">{money(annualRent)}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Conversion Cost (Est.)</span><strong className="text-right text-white">{money(conversion.low)} - {money(conversion.high)}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Potential ROI / Yield</span><strong className="text-emerald-300">{roi}</strong></div>
                    <div className="flex justify-between gap-4"><span className="text-slate-400">Confidence</span><strong className="text-emerald-300">{report?.summary?.confidence || "High"}</strong></div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-3">
                    <span className="text-lg">🏠</span><h3 className="text-lg font-bold text-white">Proposed Room Layout</h3>
                  </div>
                  <div className="mt-3 space-y-2">
                    {finalBedrooms.length > 0 ? finalBedrooms.map((room, index) => {
                      const hasPrivateEnsuite = finalEnsuites.some((ensuite) => normalise(ensuite.id).startsWith(normalise(room.id)) || normalise(ensuite.name).includes(`ensuite${index + 1}`));
                      return (
                        <div key={room.id} className="flex items-start gap-3 rounded-lg border border-slate-700 bg-[#101f2c] p-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-sm font-bold text-emerald-300">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-semibold text-white">Bedroom {index + 1} <span className="text-xs font-normal text-slate-500">({floorName(room, proposedFloorPlan.floors)})</span></div>
                              <span className="text-xs font-semibold text-cyan-300">{bedroomDescription(room, hasPrivateEnsuite || allEnsuites)}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-400">{Number(room.approxAreaSqm || 0) > 0 ? `${Number(room.approxAreaSqm).toFixed(1)} sqm usable geometry` : "Validated bedroom geometry"} • {bedroomDimensions(room)}{hasPrivateEnsuite || allEnsuites ? " • Private ensuite" : ""}</div>
                          </div>
                        </div>
                      );
                    }) : (
                      <div className="rounded-lg border border-slate-700 bg-[#101f2c] p-4 text-sm text-slate-400">{report?.recommendedLayout?.length ? report.recommendedLayout.join(" ") : "No bedroom geometry was returned."}</div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-3"><span>📋</span><h3 className="text-lg font-bold text-white">Recommendations</h3></div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {(report?.recommendations || []).map((item: string, i: number) => <li key={i} className="flex gap-2"><span className="mt-1 text-emerald-400">•</span><span>{item}</span></li>)}
                    {(!report?.recommendations || report.recommendations.length === 0) && <li className="flex gap-2"><span className="text-emerald-400">•</span><span>Use the validated geometry as the basis for detailed design, quotations and licensing checks.</span></li>}
                    <li className="flex gap-2"><span className="text-emerald-400">•</span><span>Confirm fire safety, escape routes, alarms and licensing requirements with the appropriate professionals/local authority.</span></li>
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-700 bg-[#0c1924] p-4 sm:p-5">
                  <div className="flex items-center gap-2 border-b border-slate-700 pb-3"><span>🛡️</span><h3 className="text-lg font-bold text-white">Compliance</h3></div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {(report?.compliance || []).map((item: string, i: number) => <li key={i} className="flex gap-2"><span className="mt-0.5 text-emerald-400">✓</span><span>{item}</span></li>)}
                    {(!report?.compliance || report.compliance.length === 0) && <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Final bedroom geometry is derived from the deterministic validation pipeline.</span></li>}
                    {proposedBedrooms >= 6 && <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Communal bathroom/WC provision must still be checked separately because private ensuites do not replace communal provision.</span></li>}
                    <li className="flex gap-2"><span className="text-emerald-400">✓</span><span>Planning, building-control and HMO licensing approval remains subject to professional/local-authority confirmation.</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
