"use client";

import { useState } from "react";
import { useDropzone } from "react-dropzone";

type UploadBoxProps = {
  onUploaded?: (filename: string) => void;
};

export default function UploadBox({
  onUploaded,
}: UploadBoxProps) {
  const [message, setMessage] = useState("");

  const onDrop = async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;

    const formData = new FormData();
    formData.append("file", acceptedFiles[0]);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (data.success) {
      setMessage(`✅ Uploaded: ${data.filename}`);
      onUploaded?.(data.filename);
    } else {
      setMessage("❌ Upload failed");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer"
    >
      <input {...getInputProps()} />

      {isDragActive ? (
        <p>Drop your floor plan here…</p>
      ) : (
        <>
          <h2 className="text-2xl font-bold mb-2">
            Upload Floor Plan
          </h2>

          <p>PDF, JPG or PNG</p>

          <p className="mt-4">{message}</p>
        </>
      )}
    </div>
  );
}