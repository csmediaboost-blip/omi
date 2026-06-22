'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function AppLogo() {
  return (
    <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
      <Image
        src="/logo-main.png"
        alt="OmniTask Pro"
        width={40}
        height={40}
        priority
        className="w-10 h-10"
      />
      <span className="font-bold text-white hidden sm:inline">OmniTask</span>
    </Link>
  );
}
