// components/AppLogo.tsx
// Premium iOS-style logo component using your G logo
// Usage: <AppLogo size={40} /> or <AppLogo size={32} showText />

import Image from "next/image";

interface AppLogoProps {
  size?: number;          // icon size in px (default 36)
  showText?: boolean;     // show "OmniTask Pro" text beside logo
  textSize?: string;      // tailwind text size class
  className?: string;
}

export default function AppLogo({
  size = 36,
  showText = false,
  textSize = "text-base",
  className = "",
}: AppLogoProps) {
  // iOS superellipse border-radius ≈ 22.37% of size
  const radius = Math.round(size * 0.2237);

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* iOS-style icon container */}
      <div
        className="relative shrink-0 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 shadow-lg shadow-black/50"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          boxShadow: `0 ${Math.round(size*0.02)}px ${Math.round(size*0.05)}px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        {/* Subtle inner glow ring */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            borderRadius: radius,
            boxShadow: "inset 0 0 0 0.5px rgba(200,160,80,0.25)",
          }}
        />
        {/* The logo image, padded slightly inside the icon */}
        <Image
          src="/logo-main.webp"
          alt="OmniTask Pro"
          width={size}
          height={size}
          className="object-cover scale-105"
          priority
        />
      </div>

      {showText && (
        <div className="flex flex-col leading-none font-sans">
          <span className={`font-black tracking-tight text-white ${textSize}`}>
            OmniTask
          </span>
          <span className="text-[10px] font-bold tracking-widest uppercase text-amber-600">
            Pro
          </span>
        </div>
      )}
    </div>
  );
}
