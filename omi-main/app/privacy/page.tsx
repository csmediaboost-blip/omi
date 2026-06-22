import Link from "next/link";

export default function PrivacyPage() {
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
            Legal
          </p>
          <h1 className="text-4xl font-black text-white mb-4">
            Privacy Policy
          </h1>
          <p className="text-slate-400 text-sm">Last updated: March 2026</p>
        </div>
        <div className="space-y-8 text-slate-300 leading-relaxed">
          {[
            {
              title: "1. Information We Collect",
              body: "We collect information you provide directly, including your name, email address, phone number, government-issued identification documents for KYC purposes, device fingerprint data, IP addresses, and payout account information. We also collect task submission data, quality scores, and platform activity logs.",
            },
            {
              title: "2. How We Use Your Information",
              body: "We use collected information to verify your identity and maintain the security of the contributor network, process task assignments and earnings, detect and prevent fraud, improve platform quality and AI training data accuracy, communicate with you regarding your account and submissions, and comply with applicable legal obligations.",
            },
            {
              title: "3. Data Sharing",
              body: "OmniTask Pro does not sell contributor personal data to third parties. We may share anonymized or aggregated data with enterprise clients as part of AI training data deliverables. We may share data with service providers who assist in platform operations, subject to confidentiality agreements. We will disclose information when required by law or legal process.",
            },
            {
              title: "4. KYC and Identity Data",
              body: "Identity verification documents submitted for KYC purposes are processed through secure verification partners and are not stored directly by OmniTask Pro beyond what is required for compliance. KYC data is retained for the duration required by applicable regulatory standards.",
            },
            {
              title: "5. Device and Security Data",
              body: "We collect device fingerprints, browser signatures, and IP addresses for fraud detection and network security purposes. This data is used exclusively for security monitoring and is not used for marketing or profiling purposes.",
            },
            {
              title: "6. Data Security",
              body: "We implement industry-standard security measures including encryption in transit and at rest, access controls, and regular security audits. However, no system is completely secure, and we cannot guarantee absolute security of your information.",
            },
            {
              title: "7. Data Retention",
              body: "We retain your account data for as long as your account remains active or as required by law. Following account termination, data is retained for a minimum of 12 months for fraud prevention and legal compliance purposes.",
            },
            {
              title: "8. Your Rights",
              body: "Subject to applicable law, you may have the right to access, correct, or request deletion of your personal data. Requests should be submitted through the platform support system. Note that certain data may be retained despite deletion requests where required by law.",
            },
            {
              title: "9. Changes to This Policy",
              body: "We may update this Privacy Policy periodically. We will notify users of material changes via email or platform notification. Continued use of the platform following such notification constitutes acceptance of the revised policy.",
            },
          ].map(({ title, body }) => (
            <div key={title}>
              <h2 className="text-white font-bold text-lg mb-2">{title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
