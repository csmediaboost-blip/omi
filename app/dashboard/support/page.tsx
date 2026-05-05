"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cacheService } from "@/lib/cache-service";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  ArrowLeft,
  HelpCircle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Mail,
  ExternalLink,
  CheckCircle,
  Send,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const FAQS = [
  {
    q: "How do I earn from GPU tasks?",
    a: "Complete daily thermal calibration (+$0.50), submit RLHF validation responses (+$0.10 each), and assign your GPU node to enterprise AI clients to earn hourly revenue. All require an active Operator License.",
  },
  {
    q: "When are payouts processed?",
    a: "Payouts are processed every Friday. The minimum withdrawal amount is $10.00. Your balance must clear any pending reviews before it becomes available.",
  },
  {
    q: "What is the inactivity penalty?",
    a: "If you fail to assign your GPU node for 3 or more consecutive days, 20% of your total balance is deducted. Assign your node daily to avoid this.",
  },
  {
    q: "How do I get my Operator License?",
    a: "Go to Finance → Operator License tab, or visit the License page from the More menu. The license costs $200 one-time and is valid for 4 years.",
  },
  {
    q: "My KYC is pending — how long does it take?",
    a: "KYC review typically takes 24–48 hours. You'll receive a notification once your documents are approved. Ensure photos are clear and match your provided information.",
  },
  {
    q: "Can I change my payout account?",
    a: "Yes. Go to Settings → Payout Account. Changing your payout account requires re-verification to ensure the new account name matches your KYC identity.",
  },
  {
    q: "What is the $5.00 monthly surcharge?",
    a: "After purchasing your Operator License, a $5.00 infrastructure surcharge is deducted from your balance every 30 days to cover cooling and electricity costs for your allocated GPU node.",
  },
  {
    q: "How does the referral commission work?",
    a: "You earn a commission when someone you referred completes their first approved GPU task. The commission rate depends on your GPU tier. See your Network page for your referral link.",
  },
];

export default function SupportPage() {
  const router = useRouter();
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submitTicket() {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      const user = session.user;
      await supabase.from("support_tickets").insert({
        user_id: user.id,
        subject: subject.trim(),
        message: message.trim(),
        status: "open",
      });
      setSent(true);
      setSubject("");
      setMessage("");
    } catch {
      // silently handle — ticket table may not exist yet
      setSent(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 pb-32 md:pb-12 space-y-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-white font-black text-2xl">Support & Help</h1>
              <p className="text-slate-500 text-xs mt-0.5">
                Find answers or contact the OmniTask Pro team
              </p>
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label: "GPU Plans", href: "/dashboard/gpu-plans", icon: "⚡" },
              { label: "License", href: "/dashboard/license", icon: "🛡" },
              {
                label: "Verification",
                href: "/dashboard/verification",
                icon: "✅",
              },
              {
                label: "Financials",
                href: "/dashboard/financials",
                icon: "💰",
              },
              { label: "Tax Report", href: "/dashboard/tax", icon: "📄" },
              {
                label: "API Access",
                href: "/dashboard/api-access",
                icon: "🔑",
              },
            ].map(({ label, href, icon }) => (
              <button
                key={href}
                onClick={() => router.push(href)}
                className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl p-3 hover:border-slate-600 transition-colors text-left"
              >
                <span className="text-lg">{icon}</span>
                <span className="text-slate-300 text-sm font-semibold">
                  {label}
                </span>
                <ExternalLink size={11} className="text-slate-600 ml-auto" />
              </button>
            ))}
          </div>

          {/* FAQ */}
          <div>
            <h2 className="text-white font-black text-lg mb-4 flex items-center gap-2">
              <HelpCircle size={18} className="text-slate-400" /> Frequently
              Asked Questions
            </h2>
            <div className="space-y-2">
              {FAQS.map((faq, i) => (
                <div
                  key={i}
                  className="border border-slate-800 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/20 transition-colors gap-3"
                  >
                    <span className="text-white text-sm font-semibold">
                      {faq.q}
                    </span>
                    {openFaq === i ? (
                      <ChevronUp
                        size={14}
                        className="text-slate-500 shrink-0"
                      />
                    ) : (
                      <ChevronDown
                        size={14}
                        className="text-slate-500 shrink-0"
                      />
                    )}
                  </button>
                  {openFaq === i && (
                    <div className="px-4 pb-4 border-t border-slate-800">
                      <p className="text-slate-400 text-sm leading-relaxed pt-3">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-white font-black text-lg flex items-center gap-2">
              <MessageSquare size={16} className="text-slate-400" /> Contact
              Support
            </h2>
            <p className="text-slate-400 text-sm">
              Can't find your answer above? Submit a support ticket and the team
              will respond within 24–48 hours.
            </p>

            {sent ? (
              <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-800/40 rounded-xl p-4">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-emerald-300 font-bold text-sm">
                    Ticket submitted!
                  </p>
                  <p className="text-emerald-400/70 text-xs mt-0.5">
                    We'll respond to your registered email within 24–48 hours.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-slate-400 text-xs font-semibold mb-1.5 block">
                    Subject
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. KYC not approved after 48 hours"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs font-semibold mb-1.5 block">
                    Message
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your issue in detail..."
                    rows={4}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2.5 text-sm focus:border-emerald-500/40 outline-none resize-none"
                  />
                </div>
                <button
                  onClick={submitTicket}
                  disabled={sending || !subject.trim() || !message.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {sending ? (
                    "Sending…"
                  ) : (
                    <>
                      <Send size={14} /> Submit Support Ticket
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Mail size={13} className="text-slate-600" />
              <span className="text-slate-600 text-xs">
                Or email us directly at support@omnitaskpro.com
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
