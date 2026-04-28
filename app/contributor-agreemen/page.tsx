import Link from "next/link";

export default function ContributorAgreementPage() {
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
            Contributor Agreement
          </h1>
          <p className="text-slate-400 text-sm">
            Last updated: March 2026 · Effective upon Node License Activation
          </p>
        </div>
        <div className="space-y-8 text-slate-300 leading-relaxed">
          {[
            {
              title: "Preamble",
              body: 'This Contributor Agreement is a legally binding contract between you ("Contributor") and OmniTask Pro ("Platform"). By activating a Contributor Node License, you acknowledge that you have read, understood, and agree to be bound by all terms of this Agreement. This Agreement governs your participation as a human intelligence contributor in the OmniTask distributed AI data network.',
            },
            {
              title: "1. Independent Contractor Status",
              body: "You are an independent contractor and not an employee, partner, or agent of OmniTask Pro. Nothing in this Agreement creates an employment relationship. You retain the right to engage in other work that does not conflict with this Agreement.",
            },
            {
              title: "2. Task Completion Obligations",
              body: "Contributors are required to complete all accepted tasks with accuracy and care, follow all task-specific instructions precisely, apply consistent judgment throughout each task session, and submit work that meets the quality standards established by the platform. Minimum accuracy thresholds apply based on Node level.",
            },
            {
              title: "3. Honest Participation",
              body: "All submissions must represent your own genuine human judgment. You may not use automated tools, bots, artificial intelligence systems, or any other mechanism to generate task responses on your behalf. All submissions must be produced by you personally.",
            },
            {
              title: "4. Confidentiality Obligations",
              body: "You may have access to confidential AI training datasets, proprietary model architectures, enterprise client information, and task-specific data. All such information is strictly confidential. You agree not to disclose, reproduce, or distribute any confidential information. This obligation survives termination of this Agreement indefinitely.",
            },
            {
              title: "5. Intellectual Property Assignment",
              body: "All work product you produce while performing tasks on the Platform is assigned to OmniTask Pro and its enterprise clients. You retain no intellectual property rights in any submitted work. You waive any right to attribution or compensation beyond the task reward.",
            },
            {
              title: "6. Fraud Prevention",
              body: "OmniTask Pro maintains zero tolerance toward fraudulent activity. Any attempt to manipulate task outcomes, earn rewards through inauthentic submissions, or circumvent the quality verification system will result in immediate account termination and forfeiture of all accumulated earnings.",
            },
            {
              title: "7. Payment Terms",
              body: "Compensation is determined by Node level and task type. Earnings accumulate in your platform wallet and may be withdrawn subject to minimum thresholds ($10 minimum), weekly limits ($500 maximum), and the Friday payout schedule. Payment is contingent upon task approval and account good standing.",
            },
            {
              title: "8. Account Termination",
              body: "OmniTask Pro may terminate your access immediately for violation of this Agreement, sustained poor quality performance, fraudulent activity, or any conduct harmful to the platform or its clients. Legitimately approved earnings prior to termination will be processed in the normal payout cycle.",
            },
          ].map(({ title, body }) => (
            <div key={title}>
              <h2 className="text-white font-bold text-lg mb-2">{title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
          <div className="p-5 bg-emerald-900/10 border border-emerald-800/30 rounded-xl">
            <p className="text-emerald-300 text-sm font-semibold mb-2">
              Digital Acceptance
            </p>
            <p className="text-slate-400 text-sm">
              This Agreement is accepted digitally during the Node License
              activation process. By completing activation, you confirm you have
              read and agree to all terms of this Agreement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
