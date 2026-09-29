"use client";

// One file picker for every scanner. Two ways in:
//   • "Choose screenshot" — photo library / Files (accept="image/*"; no capture
//     attribute, so iOS offers Photo Library, Take Photo and Choose File)
//   • "Take photo" — opens the rear camera directly (capture="environment")
// Screenshots already saved on the phone always work; the camera is optional.

import { useRef } from "react";

export function ScreenshotPicker({
  onFiles,
  multiple = false,
  label = "Choose screenshot",
  disabled = false,
  showCamera = true,
  primaryClassName = "flex-[2] bg-blue-600 rounded-xl py-3 font-semibold disabled:bg-slate-700",
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  label?: string;
  disabled?: boolean;
  showCamera?: boolean;
  primaryClassName?: string;
}) {
  const libRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/") || f.type === "");
    e.target.value = ""; // allow picking the same file again
    if (files.length) onFiles(files);
  };
  return (
    <div className="flex gap-2">
      <button type="button" disabled={disabled} onClick={() => libRef.current?.click()} className={primaryClassName}>
        {label}
      </button>
      {showCamera && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => camRef.current?.click()}
          className="flex-1 rounded-xl py-3 border border-slate-700 text-sm disabled:opacity-40"
        >
          Take photo
        </button>
      )}
      <input ref={libRef} type="file" accept="image/*" multiple={multiple} className="hidden" onChange={handle} data-testid="screenshot-input" />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
    </div>
  );
}
