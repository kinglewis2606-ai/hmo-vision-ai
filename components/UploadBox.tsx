"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";

export default function UploadBox({
  onUploaded,
}: {
  onUploaded?: (filename: string, imageUrl: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const raw = await res.text();
      let data: any;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        throw new Error(`Upload server returned HTTP ${res.status} without valid JSON.`);
      }

      if (!res.ok || !data?.success || !data?.filename) {
        throw new Error(data?.error || `Upload failed (HTTP ${res.status}).`);
      }

      const imageUrl = `/api/uploads/${encodeURIComponent(data.filename)}`;
      setMessage("✅ Upload successful");
      onUploaded?.(data.filename, imageUrl);
    } catch (error) {
      console.error("Upload error:", error);
      setMessage(`❌ ${error instanceof Error ? error.message : "Upload failed."}`);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: uploading,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "application/pdf": [".pdf"],
    },
  });

  return (
    <div
      {...getRootProps()}
      className="cursor-pointer rounded-xl border-2 border-dashed border-slate-600 p-10 text-center"
    >
      <input {...getInputProps()} />

      {isDragActive ? (
        <p>Drop your floor plan here…</p>
      ) : (
        <>
          <h2 className="mb-2 text-2xl font-bold">
            {uploading ? "Uploading…" : "Upload Floor Plan"}
          </h2>
          <p>PDF, JPG or PNG</p>
          {message && <p className="mt-4">{message}</p>}
        </>
      )}
    </div>
  );
}
