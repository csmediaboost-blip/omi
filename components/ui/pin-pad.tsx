"use client";
// components/ui/pin-pad.tsx
// Shared numeric PIN pad — shows digit keyboard (0-9), never QWERTY/ABC
// Used in: SetPinForm, VerifyPinForm, WithdrawModal

import { Delete } from "lucide-react";

type PinPadProps = {
  value: string;
  onChange: (val: string) => void;
  maxLength?: number;
  disabled?: boolean;
};

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "del"],
];

export function PinPad({
  value,
  onChange,
  maxLength = 6,
  disabled = false,
}: PinPadProps) {
  function handleKey(key: string) {
    if (disabled) return;
    if (key === "del") {
      onChange(value.slice(0, -1));
    } else if (key === "") {
      // blank cell — do nothing
    } else {
      if (value.length < maxLength) {
        onChange(value + key);
      }
    }
  }

  return (
    <div className="select-none w-full max-w-[280px] mx-auto">
      {KEYS.map((row, ri) => (
        <div key={ri} className="flex gap-3 mb-3">
          {row.map((key, ki) => {
            if (key === "") {
              return <div key={ki} className="flex-1" />;
            }
            const isDel = key === "del";
            return (
              <button
                key={ki}
                type="button"
                onClick={() => handleKey(key)}
                disabled={disabled}
                className={`
                  flex-1 h-14 rounded-2xl font-black text-xl
                  flex items-center justify-center
                  transition-all duration-100 active:scale-95
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${
                    isDel
                      ? "bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600"
                      : "bg-slate-800/80 border border-slate-700/60 text-white hover:bg-slate-700 hover:border-emerald-500/40 hover:text-emerald-300"
                  }
                `}
                style={{
                  WebkitTapHighlightColor: "transparent",
                  touchAction: "manipulation",
                }}
              >
                {isDel ? <Delete size={18} /> : key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default PinPad;
