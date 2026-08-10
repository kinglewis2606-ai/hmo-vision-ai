"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { AnalysisPipelineResult } from "@/lib/types/floorPlan";

type FloorRendering = { floorIndex: number; original: string; proposed: string };

export default function NewAnalysisPage() {
  const [uploading, setUploading] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("House");
  const [result, setResult] = useState<AnalysisPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState(0);

  // ── Upload ──────────────────────────────────────────────────────────────

  const onDrop = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", files[0]);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Upload failed");
      setFilename(data.filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { "image/jpeg": [], "image/png": [], "application/pdf": [] },
  });

  // ── Analyse ─────────────────────────────────────────────────────────────

  const handleAnalyse = async () => {
    if (!filename) return;
    setAnalysing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, address, propertyType }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? "Analysis failed");
      setResult(data.result as AnalysisPipelineResult);
      setActiveFloor(0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalysing(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const floors = result?.originalFloorPlan.floors ?? [];
  const currentOrigFloor = result?.originalFloorPlan.floors[activeFloor];
  const currentPropFloor = result?.proposedFloorPlan.floors[activeFloor];
  const ai = result?.hmoAnalysis;

  // Per-floor rendered images — stored on the result object if provided
  // by the API. Otherwise fall back to the top-level images for floor 0.
  const getOrigImg = () => result?.originalLayoutImage ?? null;
  const getPropImg = () => result?.proposedLayoutImage ?? null;

  return (
    <main className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="bg-slate-900 text-white p-6 flex items-center gap-4">
        <a href="/" className="text-2xl font-bold">🏠 HMO Vision AI</a>
        <span className="text-slate-400 text-sm">/ New Analysis</span>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* Upload + form */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Upload Floor Plan</h2>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
            }`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <p className="text-blue-600">Uploading…</p>
            ) : filename ? (
              <p className="text-green-600 font-semibold">✅ {filename}</p>
            ) : isDragActive ? (
              <p>Drop your floor plan here…</p>
            ) : (
              <>
                <p className="text-3xl mb-2">📤</p>
                <p className="font-semibold">Drag & drop or click to upload</p>
                <p className="text-sm text-gray-500 mt-1">JPG, PNG, PDF · max 20 MB</p>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 12 High Street, London"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                maxLength={500}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Type
              </label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option>House</option>
                <option>Flat</option>
                <option>Bungalow</option>
                <option>Maisonette</option>
                <option>Semi-Detached</option>
                <option>Terraced</option>
                <option>Detached</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleAnalyse}
            disabled={!filename || analysing}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 px-6 rounded-xl transition-colors"
          >
            {analysing ? "Analysing…" : "Analyse Floor Plan"}
          </button>

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Results */}
        {result && (
          <>
            {/* HMO Score banner */}
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-5xl font-bold text-blue-600">
                    {ai?.hmoScore ?? "—"}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">HMO Score</div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold">{ai?.verdict}</h3>
                  <p className="text-gray-600 text-sm mt-1">{ai?.investorSummary}</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-700">
                    {ai?.estimatedConversionCost
                      ? `£${(ai.estimatedConversionCost.low / 1000).toFixed(0)}k–£${(ai.estimatedConversionCost.high / 1000).toFixed(0)}k`
                      : "—"}
                  </div>
                  <div className="text-sm text-gray-500">Conversion Cost</div>
                  <div className="text-lg font-semibold text-blue-700 mt-1">
                    £{ai?.estimatedMonthlyRent?.toLocaleString() ?? "—"}/mo
                  </div>
                  <div className="text-sm text-gray-500">Est. Monthly Rent</div>
                </div>
              </div>
            </div>

            {/* Floor selector */}
            {floors.length > 1 && (
              <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3">
                <span className="font-semibold text-sm">Floor:</span>
                {floors.map((f, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveFloor(i)}
                    className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                      activeFloor === i
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Side-by-side floor plan comparison */}
            <div>
              <h2 className="text-2xl font-bold mb-4 text-center">
                Floor Plan Comparison
                {floors.length > 1 && (
                  <span className="text-base font-normal text-gray-500 ml-2">
                    — {floors[activeFloor]?.label}
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-2 gap-6">
                {/* Original */}
                <div className="bg-white rounded-xl shadow p-4">
                  <h3 className="font-bold text-center mb-3 text-gray-700">
                    Original Detected Layout
                  </h3>
                  {getOrigImg() ? (
                    <img
                      src={getOrigImg()!}
                      alt="Original floor plan"
                      className="w-full rounded border"
                    />
                  ) : (
                    <FloorSummary floor={currentOrigFloor} label="Original" />
                  )}
                  {currentOrigFloor && (
                    <RoomList rooms={currentOrigFloor.rooms} />
                  )}
                </div>

                {/* Proposed */}
                <div className="bg-white rounded-xl shadow p-4">
                  <h3 className="font-bold text-center mb-3 text-gray-700">
                    Proposed HMO Layout
                  </h3>
                  {getPropImg() ? (
                    <img
                      src={getPropImg()!}
                      alt="Proposed HMO floor plan"
                      className="w-full rounded border"
                    />
                  ) : (
                    <FloorSummary floor={currentPropFloor} label="Proposed" />
                  )}
                  {currentPropFloor && (
                    <RoomList rooms={currentPropFloor.rooms} modified />
                  )}
                </div>
              </div>
            </div>

            {/* Recommended changes */}
            {ai?.recommendedLayout && ai.recommendedLayout.length > 0 && (
              <div className="bg-white rounded-xl shadow p-6">
                <h3 className="text-xl font-bold mb-4">Recommended Changes</h3>
                <ol className="space-y-2">
                  {ai.recommendedLayout.map((c, i) => (
                    <li key={i} className="flex gap-3 items-start">
                      <span className="bg-blue-600 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        {c.step ?? i + 1}
                      </span>
                      <span className="text-sm text-gray-700">{c.description}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Grid: recommendations + fire safety + planning */}
            <div className="grid grid-cols-3 gap-6">
              <InfoCard title="Recommendations" items={ai?.recommendations} colour="blue" />
              <InfoCard title="🔥 Fire Safety" items={ai?.fireSafety} colour="orange" />
              <div className="bg-white rounded-xl shadow p-6">
                <h3 className="font-bold mb-3">Planning Risk</h3>
                <p className="text-sm text-gray-700">{ai?.planningRisk ?? "—"}</p>
              </div>
            </div>

            {/* Compliance */}
            {ai?.compliance && ai.compliance.length > 0 && (
              <InfoCard title="Compliance Notes" items={ai.compliance} colour="green" />
            )}
          </>
        )}
      </div>
    </main>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FloorSummary({
  floor,
  label,
}: {
  floor: import("@/lib/types/floorPlan").Floor | undefined;
  label: string;
}) {
  if (!floor) return <p className="text-gray-400 text-sm text-center py-8">No data</p>;

  return (
    <div className="border rounded-lg p-4 bg-gray-50 text-sm">
      <p className="font-semibold mb-2">{label}: {floor.label}</p>
      <p className="text-gray-600">
        {floor.rooms.length} room{floor.rooms.length !== 1 ? "s" : ""} detected ·{" "}
        {floor.walls.length} wall segment{floor.walls.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function RoomList({
  rooms,
  modified = false,
}: {
  rooms: import("@/lib/types/floorPlan").Room[];
  modified?: boolean;
}) {
  if (!rooms.length) return null;

  return (
    <div className="mt-3 space-y-1">
      {rooms.map((r) => (
        <div
          key={r.id}
          className={`flex justify-between text-xs px-2 py-1 rounded ${
            modified && r.modified
              ? "bg-yellow-100 text-yellow-800 font-medium"
              : "bg-gray-50 text-gray-600"
          }`}
        >
          <span>{r.label}</span>
          {r.areaM2 != null && <span>{r.areaM2}m²</span>}
        </div>
      ))}
    </div>
  );
}

function InfoCard({
  title,
  items,
  colour,
}: {
  title: string;
  items?: string[];
  colour: "blue" | "orange" | "green";
}) {
  const colours = {
    blue: "bg-blue-50 text-blue-800",
    orange: "bg-orange-50 text-orange-800",
    green: "bg-green-50 text-green-800",
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <h3 className="font-bold mb-3">{title}</h3>
      {items && items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className={`text-xs rounded px-2 py-1 ${colours[colour]}`}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">None</p>
      )}
    </div>
  );
}
