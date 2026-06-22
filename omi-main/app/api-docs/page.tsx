'use client';

import { useState } from 'react';
import { ChevronDown, Code, Lock, Server, Zap } from 'lucide-react';
import Link from 'next/link';

const API_ENDPOINTS = [
  {
    category: 'Authentication',
    endpoints: [
      {
        method: 'POST',
        path: '/api/auth/register',
        desc: 'Create a new user account with email and password',
      },
      {
        method: 'POST',
        path: '/api/auth/signin',
        desc: 'Authenticate user and receive session token',
      },
      {
        method: 'POST',
        path: '/api/auth/set-pin',
        desc: 'Set or update withdrawal PIN',
      },
      {
        method: 'POST',
        path: '/api/auth/verify-pin',
        desc: 'Verify PIN for secure operations',
      },
    ],
  },
  {
    category: 'GPU Tasks & Allocation',
    endpoints: [
      {
        method: 'GET',
        path: '/api/gpu-tasks',
        desc: 'List available GPU task batches for compute work',
      },
      {
        method: 'POST',
        path: '/api/tasks/submit',
        desc: 'Submit completed GPU task and log compute hours',
      },
      {
        method: 'GET',
        path: '/api/allocation/route',
        desc: 'Check your current GPU node allocation and status',
      },
    ],
  },
  {
    category: 'Payment & Checkout',
    endpoints: [
      {
        method: 'POST',
        path: '/api/payment/initiate',
        desc: 'Initialize payment for GPU plan purchase',
      },
      {
        method: 'POST',
        path: '/api/checkout/route',
        desc: 'Process checkout and activate GPU node',
      },
      {
        method: 'POST',
        path: '/api/payment/confirm-crypto',
        desc: 'Confirm cryptocurrency payment',
      },
      {
        method: 'GET',
        path: '/api/payment/config',
        desc: 'Retrieve payment provider configuration',
      },
    ],
  },
  {
    category: 'Financials & Withdrawals',
    endpoints: [
      {
        method: 'GET',
        path: '/api/financials',
        desc: 'Get user earnings, balance, and transaction history',
      },
      {
        method: 'POST',
        path: '/api/withdraw/request',
        desc: 'Submit withdrawal request for earned funds',
      },
      {
        method: 'GET',
        path: '/api/dashboard/stats',
        desc: 'Retrieve dashboard statistics and analytics',
      },
    ],
  },
  {
    category: 'User Management',
    endpoints: [
      {
        method: 'GET',
        path: '/api/users/[userId]',
        desc: 'Retrieve user profile and KYC status',
      },
      {
        method: 'POST',
        path: '/api/settings/update',
        desc: 'Update user account settings and preferences',
      },
      {
        method: 'GET',
        path: '/api/users/[userId]/transactions',
        desc: 'Get detailed transaction history',
      },
    ],
  },
];

function ApiEndpointCard({
  method,
  path,
  desc,
}: {
  method: string;
  path: string;
  desc: string;
}) {
  const methodColor = {
    GET: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    POST: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    PUT: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    DELETE: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <div className="border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
      <div className="flex items-start gap-3 mb-2">
        <span
          className={`px-2.5 py-1 rounded font-mono text-xs font-bold border ${
            methodColor[method as keyof typeof methodColor] ||
            methodColor.GET
          }`}
        >
          {method}
        </span>
        <code className="text-slate-300 font-mono text-sm flex-1">{path}</code>
      </div>
      <p className="text-slate-400 text-sm">{desc}</p>
    </div>
  );
}

function CategorySection({
  category,
  endpoints,
}: {
  category: string;
  endpoints: Array<{
    method: string;
    path: string;
    desc: string;
  }>;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between bg-slate-900/50 hover:bg-slate-900 transition-colors"
      >
        <span className="text-white font-bold flex items-center gap-2">
          <Server size={18} />
          {category}
        </span>
        <ChevronDown
          size={18}
          className={`text-emerald-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open && (
        <div className="p-6 space-y-3 bg-black/20">
          {endpoints.map((ep, i) => (
            <ApiEndpointCard
              key={i}
              method={ep.method}
              path={ep.path}
              desc={ep.desc}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        {/* Header */}
        <div className="mb-12">
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 text-sm mb-6 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-5xl font-black text-white mb-4">API Documentation</h1>
          <p className="text-slate-400 text-lg max-w-2xl">
            Build on OmniTask Pro. Integrate GPU allocation, real-time earnings, payments, and task processing directly into your application.
          </p>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          {[
            { icon: Lock, label: 'Authentication', color: 'text-blue-400' },
            { icon: Zap, label: 'GPU Tasks', color: 'text-amber-400' },
            { icon: Code, label: 'REST API', color: 'text-emerald-400' },
            { icon: Server, label: 'Webhooks', color: 'text-violet-400' },
          ].map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="border border-slate-800 rounded-lg p-4 hover:border-slate-700 transition-colors text-center"
            >
              <Icon size={24} className={`${color} mx-auto mb-2`} />
              <p className="text-white font-semibold text-sm">{label}</p>
            </div>
          ))}
        </div>

        {/* Authentication */}
        <div className="mb-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <h2 className="text-white font-bold mb-2 flex items-center gap-2">
            <Lock size={18} className="text-emerald-400" />
            API Authentication
          </h2>
          <p className="text-slate-300 text-sm mb-3">
            All API requests require an authentication token. Include your token in the Authorization header:
          </p>
          <code className="bg-black/40 p-3 rounded text-emerald-400 font-mono text-sm block">
            Authorization: Bearer YOUR_API_TOKEN
          </code>
          <p className="text-slate-400 text-xs mt-3">
            Generate your API token from your account settings dashboard.
          </p>
        </div>

        {/* Endpoints */}
        <h2 className="text-2xl font-black text-white mb-6">API Endpoints</h2>
        <div className="space-y-4 mb-12">
          {API_ENDPOINTS.map((cat) => (
            <CategorySection
              key={cat.category}
              category={cat.category}
              endpoints={cat.endpoints}
            />
          ))}
        </div>

        {/* Examples */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Example Request</h2>
          <code className="bg-black/40 p-4 rounded text-slate-300 font-mono text-sm block overflow-x-auto">
            {`curl -X GET https://omnitaskpro.online/api/financials \\
  -H "Authorization: Bearer YOUR_API_TOKEN" \\
  -H "Content-Type: application/json"`}
          </code>
        </div>

        {/* Support */}
        <div className="border border-slate-800 rounded-xl p-6 bg-slate-900/30 text-center">
          <h3 className="text-white font-bold mb-2">Need Help?</h3>
          <p className="text-slate-400 text-sm mb-4">
            Review our complete API reference or contact our developer support team.
          </p>
          <Link href="/dashboard/support">
            <button className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2 rounded-lg transition-colors">
              Contact Support
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
