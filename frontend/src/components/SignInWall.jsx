import React from 'react';
import {
  Wallet, Mail, ShieldCheck, BarChart3, ArrowRight, Sparkles,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Mail,
    title: 'Auto-parse bank emails',
    desc: 'Reads UPI, NEFT & credit-card alerts from your inbox',
  },
  {
    icon: BarChart3,
    title: 'Smart categorization',
    desc: 'AI-powered merchant & category detection',
  },
  {
    icon: ShieldCheck,
    title: 'Private & secure',
    desc: 'Your data stays yours — nothing is shared or stored externally',
  },
];

export default function SignInWall({ apiUrl, onGuestLogin }) {
  const connectUrl = `${apiUrl}/auth/google?origin=${encodeURIComponent(window.location.origin)}`;

  return (
    <div className="min-h-screen bg-[#FAF8F3] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">

      {/* Decorative background accents */}
      <div className="absolute top-[-120px] right-[-80px] w-[400px] h-[400px] rounded-full bg-[#2D5C4E]/[0.04] blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-100px] left-[-60px] w-[350px] h-[350px] rounded-full bg-[#C9A961]/[0.06] blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="relative z-10 w-full max-w-md">

        {/* Logo & branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#2D5C4E] flex items-center justify-center text-white shadow-md mb-4 relative">
            <Wallet className="w-8 h-8" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#C9A961] flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </span>
          </div>
          <h1 className="text-2xl font-bold text-[#1C1B19] tracking-tight">
            SpendLens
          </h1>
          <p className="text-xs text-[#6C6A65] font-semibold tracking-wider uppercase mt-1">
            UPI &amp; Bank Passbook Analyser
          </p>
        </div>

        {/* Glass card */}
        <div className="bg-white/80 backdrop-blur-sm border border-[#E8E3D8] rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-[#1C1B19] tracking-tight">
              Sign in to get started
            </h2>
            <p className="text-sm text-[#6C6A65] mt-1.5 leading-relaxed">
              Connect your Gmail account so SpendLens can scan your bank &amp;
              UPI transaction emails and build your personal expense dashboard.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {/* CTA button */}
            <a
              href={connectUrl}
              className="group flex items-center justify-center gap-3 w-full px-5 py-3.5 bg-[#2D5C4E] hover:bg-[#254B40] text-white rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md active:scale-[0.98]"
            >
              <Mail className="w-5 h-5" />
              <span>Connect Gmail</span>
              <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </a>

            {/* Guest button */}
            <button
              onClick={onGuestLogin}
              className="w-full px-5 py-3.5 bg-white border border-[#E8E3D8] hover:bg-[#F5F2EA] text-[#1C1B19] rounded-xl text-sm font-bold transition-all shadow-sm active:scale-[0.98]"
            >
              Continue as Guest (Demo)
            </button>
          </div>

          {/* Permission note */}
          <p className="text-[11px] text-[#6C6A65] text-center mt-4 leading-relaxed">
            We only request <span className="font-semibold text-[#1C1B19]">read-only</span> access
            to your emails. SpendLens cannot send, modify, or delete anything.
          </p>
        </div>

        {/* Feature bullets */}
        <div className="mt-8 space-y-4">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="flex items-start gap-3.5 group"
              >
                <div className="w-9 h-9 rounded-lg bg-white border border-[#E8E3D8] flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:border-[#2D5C4E]/30 transition">
                  <Icon className="w-4 h-4 text-[#2D5C4E]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1C1B19]">
                    {f.title}
                  </p>
                  <p className="text-xs text-[#6C6A65] mt-0.5">
                    {f.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[#6C6A65] font-mono mt-10">
          SpendLens Ledger v1.0
        </p>
      </div>
    </div>
  );
}
