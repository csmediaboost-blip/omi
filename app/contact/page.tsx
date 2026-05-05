import Link from "next/link";
import { Mail, Clock, Shield } from "lucide-react";

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <nav className="border-b border-slate-800 bg-slate-950/95 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-black text-white">
            Omni<span className="text-emerald-400">Task</span>
            <span className="text-slate-600 font-light ml-1 text-sm">PRO</span>
          </Link>
          <Link
            href="/"
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-6 py-16 space-y-10">
        <div>
          <p className="text-emerald-400 text-xs font-bold tracking-widest uppercase mb-3">
            Support
          </p>
          <h1 className="text-4xl font-black text-white mb-4">
            Contact Support
          </h1>
          <p className="text-slate-400 max-w-xl">
            Our support team is available to assist with account issues,
            verification questions, payment inquiries, and technical concerns.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Mail,
              title: "Email Support",
              desc: "For general inquiries and account support.",
              detail: "support@omnitaskpro.com",
              note: "Response within 24–48 hours",
            },
            {
              icon: Clock,
              title: "Response Times",
              desc: "Standard support response times.",
              detail: "24–48 Business Hours",
              note: "Mon–Fri excluding holidays",
            },
            {
              icon: Shield,
              title: "Security Issues",
              desc: "For reporting fraud or security vulnerabilities.",
              detail: "security@omnitaskpro.com",
              note: "Prioritized response",
            },
          ].map(({ icon: Icon, title, desc, detail, note }) => (
            <div
              key={title}
              className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-3"
            >
              <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center">
                <Icon size={18} className="text-emerald-400" />
              </div>
              <h3 className="text-white font-bold">{title}</h3>
              <p className="text-slate-400 text-sm">{desc}</p>
              <p className="text-emerald-400 font-semibold text-sm">{detail}</p>
              <p className="text-slate-600 text-xs">{note}</p>
            </div>
          ))}
        </div>

        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-5">
          <h2 className="text-white font-bold text-lg">
            Before Contacting Support
          </h2>
          <p className="text-slate-400 text-sm">
            Please review the following resources first — many common questions
            are answered in our documentation:
          </p>
          <div className="space-y-2">
            {[
              { label: "Frequently Asked Questions", href: "/#faq" },
              { label: "Platform Terms of Service", href: "/terms" },
              {
                label: "Contributor Agreement",
                href: "/contributor-agreement",
              },
              { label: "Privacy Policy", href: "/privacy" },
            ].map(({ label, href }) => (
              <div key={label}>
                <Link
                  href={href}
                  className="text-emerald-400 hover:text-emerald-300 text-sm flex items-center gap-2 transition-colors"
                >
                  → {label}
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
          <p className="text-amber-300 text-sm font-semibold mb-1">
            Payment & Withdrawal Inquiries
          </p>
          <p className="text-slate-400 text-sm">
            For payment-related issues, please include your account email, the
            transaction reference number, and a description of the issue.
            Payment disputes are reviewed within 5 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
