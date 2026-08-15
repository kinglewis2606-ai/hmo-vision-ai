"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";

export default function UploadBox({
  onUploaded,
}: {
  onUploaded?: (filename: string, imageUrl: string) => void;
}) {
  const [message, setMessage] = useState("");

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setMessage("");

    const formData = new FormData();
    formData.append("file", acceptedFiles[0]);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        setMessage("✅ Upload successful");
        onUploaded?.(data.filename, `/api/uploads/${data.filename}`);
      } else {
        setMessage(`❌ ${data.error || "Upload failed"}`);
      }
    } catch {
      setMessage("❌ Upload failed. Please try again.");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
  });

  return (
    <div {...getRootProps()} className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer">
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Drop your floor plan here…</p>
      ) : (
        <>
          <h2 className="text-2xl font-bold mb-2">Upload Floor Plan</h2>
          <p>JPG, PNG or WebP</p>
          <p className="mt-2 text-xs text-slate-400">PDF uploads are rejected until PDF-to-image conversion is implemented.</p>
          <p className="mt-4 text-sm">{message}</p>
        </>
      )}
    </div>
  );
}
