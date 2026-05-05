import Link from "next/link";

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="text-slate-400 text-sm">Last updated: March 2026</p>
        </div>
        <div className="space-y-8 text-slate-300 leading-relaxed">
          {[
            {
              title: "1. Acceptance of Terms",
              body: "By accessing or using the OmniTask Pro platform, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using or accessing this platform.",
            },
            {
              title: "2. Platform Description",
              body: "OmniTask Pro is an AI data contributor platform that facilitates the completion of structured digital tasks including AI model evaluation, data labeling, content verification, and related workflows. The platform connects verified human contributors with enterprise AI systems.",
            },
            {
              title: "3. Eligibility",
              body: "You must be at least 18 years of age to use this platform. By using OmniTask Pro, you represent and warrant that you are at least 18 years old and legally capable of entering into binding agreements in your jurisdiction.",
            },
            {
              title: "4. Account Registration and Verification",
              body: "Users are required to complete a multi-step verification process including email verification, phone verification, government-issued identity verification (KYC), and payout account registration before accessing the contributor task network. Providing false or misleading information during registration will result in immediate account termination.",
            },
            {
              title: "5. Contributor License",
              body: "Access to the task network requires the purchase and activation of a Contributor Node License. License fees are non-refundable once a node has been activated and tasks have been accessed. The Contributor License grants a non-exclusive, non-transferable right to participate in the task network at the purchased node level.",
            },
            {
              title: "6. Prohibited Conduct",
              body: "Users may not create multiple accounts, use automated tools or bots to complete tasks, attempt to manipulate quality scores, share account credentials, engage in self-referral fraud, submit fabricated or dishonest task responses, or engage in any activity designed to defraud the platform or its clients.",
            },
            {
              title: "7. Earnings and Payments",
              body: "Earnings are contingent on task approval by the platform's quality review system. The platform reserves the right to withhold or reverse earnings associated with tasks found to be fraudulent or in violation of these terms. All withdrawals are subject to minimum thresholds, weekly limits, and the Friday payout schedule.",
            },
            {
              title: "8. Intellectual Property",
              body: "All work product produced by contributors on the platform is assigned to OmniTask Pro and its enterprise clients. Contributors retain no intellectual property rights in submitted work. The OmniTask Pro brand, platform design, and technology are the exclusive property of OmniTask Pro.",
            },
            {
              title: "9. Termination",
              body: "OmniTask Pro reserves the right to terminate or suspend any account at any time for violation of these terms, sustained poor quality performance, or any conduct deemed harmful to the platform, its clients, or other contributors. Users may terminate their account at any time by contacting support.",
            },
            {
              title: "10. Limitation of Liability",
              body: "To the maximum extent permitted by law, OmniTask Pro shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your participation in the platform.",
            },
            {
              title: "11. Governing Law",
              body: "These Terms of Service shall be governed by applicable law. Any disputes arising under these terms shall be resolved through binding arbitration.",
            },
            {
              title: "12. Changes to Terms",
              body: "OmniTask Pro reserves the right to modify these terms at any time. Continued use of the platform following notice of changes constitutes acceptance of the revised terms.",
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
