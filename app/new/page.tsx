"use client";

import { useState } from "react";
import UploadBox from "@/components/UploadBox";

export default function NewProjectPage() {
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Semi Detached");

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
          onChange={(e)=>setAddress(e.target.value)}
        />

        <select
          className="w-full border rounded-lg p-3 mb-6"
          value={propertyType}
          onChange={(e)=>setPropertyType(e.target.value)}
        >
          <option>Detached</option>
          <option>Semi Detached</option>
          <option>Terraced</option>
          <option>Flat</option>
          <option>Bungalow</option>
        </select>

        <UploadBox />

      </div>
    </main>
  );
}
