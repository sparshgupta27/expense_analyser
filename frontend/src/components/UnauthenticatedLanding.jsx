import React from 'react';
import { Wallet, ShieldCheck, Mail, Zap, Lock, ArrowRight, RefreshCw, BarChart2 } from 'lucide-react';
import { Card } from './ui/Card';
import { API_URL } from '../api/client';

export default function UnauthenticatedLanding() {
  const googleAuthUrl = `${API_URL}/auth/google?origin=${encodeURIComponent(window.location.origin)}`;

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-8 animate-fadeIn">
      {/* Hero Header Card */}
      <Card className="p-8 sm:p-12 text-center bg-white border-[#E8E3D8] shadow-sm relative overflow-hidden">
        {/* Background accent glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#2D5C4E]/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-[#EBF3F0] border border-[#D2E4DC] flex items-center justify-center text-[#2D5C4E] shadow-xs mb-6">
            <Wallet className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-4xl font-bold text-[#1C1B19] tracking-tight leading-tight">
            Track your bank & UPI expenses directly from Gmail
          </h2>

          <p className="text-sm sm:text-base text-[#6C6A65] mt-3 leading-relaxed">
            Connect your Gmail account to automatically parse transaction alerts from HDFC, ICICI, SBI, PhonePe, Paytm, Swiggy, Zomato & more into your personal passbook.
          </p>

          {/* Primary Action Button */}
          <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
            <a
              href={googleAuthUrl}
              className="w-full sm:w-auto px-8 py-3.5 bg-[#2D5C4E] hover:bg-[#254B40] text-white font-semibold text-sm rounded-xl transition shadow-sm flex items-center justify-center gap-3 group"
            >
              {/* Google G Logo SVG */}
              <svg className="w-5 h-5 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-[#6C6A65] font-mono">
            <Lock className="w-3.5 h-3.5 text-[#2D5C4E]" />
            <span>Read-only Gmail scope • Strictly isolated per account</span>
          </div>
        </div>
      </Card>

      {/* Feature Highlights Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-white border-[#E8E3D8]">
          <div className="w-10 h-10 rounded-lg bg-[#EBF3F0] text-[#2D5C4E] flex items-center justify-center mb-4">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-[#1C1B19] text-base mb-1">Private & Isolated</h3>
          <p className="text-xs text-[#6C6A65] leading-relaxed">
            Your emails and financial data are strictly linked to your email address in PostgreSQL. No shared data across users.
          </p>
        </Card>

        <Card className="p-6 bg-white border-[#E8E3D8]">
          <div className="w-10 h-10 rounded-lg bg-[#EDF3F7] text-[#3A6B88] flex items-center justify-center mb-4">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-[#1C1B19] text-base mb-1">Automated Parser</h3>
          <p className="text-xs text-[#6C6A65] leading-relaxed">
            Smart regex & heuristics extract amounts, merchants, dates, and payment methods from bank alerts automatically.
          </p>
        </Card>

        <Card className="p-6 bg-white border-[#E8E3D8]">
          <div className="w-10 h-10 rounded-lg bg-[#FAF5EA] text-[#8C6D23] flex items-center justify-center mb-4">
            <RefreshCw className="w-5 h-5" />
          </div>
          <h3 className="font-semibold text-[#1C1B19] text-base mb-1">Subscription Detection</h3>
          <p className="text-xs text-[#6C6A65] leading-relaxed">
            Identifies recurring monthly/annual subscriptions like Netflix, Spotify, or software tools and flags price changes.
          </p>
        </Card>
      </div>

      {/* Supported Banks & Platforms Pill Bar */}
      <Card className="p-6 bg-white border-[#E8E3D8] text-center">
        <p className="text-xs font-semibold text-[#6C6A65] uppercase tracking-wider mb-4 font-mono">
          Supported Bank & App Email Formats
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {['HDFC Bank', 'ICICI Bank', 'SBI Card', 'Axis Bank', 'Kotak Bank', 'PhonePe', 'Paytm', 'Google Pay', 'Swiggy', 'Zomato', 'Amazon'].map((b) => (
            <span
              key={b}
              className="px-3 py-1 bg-[#FAF8F3] border border-[#E8E3D8] text-[#1C1B19] text-xs font-mono font-medium rounded-md shadow-2xs"
            >
              {b}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
