import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
  Mail,
  MessageSquare,
  Send,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react';

const TOPICS = [
  { id: 'sales', label: 'Sales & pricing' },
  { id: 'support', label: 'Technical support' },
  { id: 'security', label: 'Security report' },
  { id: 'partner', label: 'Partnership' },
];

const CHANNELS = [
  {
    icon: MessageSquare,
    title: 'Engineering support',
    desc: 'P1 incidents answered in under 15 minutes, 24/7.',
    action: 'support@pulsegrid.dev',
    meta: '~12 min median response',
  },
  {
    icon: Zap,
    title: 'Sales engineering',
    desc: 'Architecture reviews, volume pricing, SSO & SOC 2 docs.',
    action: 'Book a 20-min call',
    meta: 'Same-day availability',
  },
  {
    icon: Shield,
    title: 'Security disclosures',
    desc: 'PGP-encrypted channel for responsible disclosure.',
    action: 'security@pulsegrid.dev',
    meta: 'Key fingerprint 4F2A 91C8',
  },
];

const REGIONS = [
  { code: 'us-east', city: 'Virginia', ms: 38 },
  { code: 'eu-west', city: 'Frankfurt', ms: 41 },
  { code: 'ap-south', city: 'Singapore', ms: 67 },
  { code: 'sa-east', city: 'São Paulo', ms: 89 },
];

export default function App() {
  const [topic, setTopic] = useState('sales');
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', company: '', message: '' });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 2400);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  const jitter = (base, seed) => base + ((tick * seed) % 7) - 3;

  return (
    <>

    <div className="min-h-screen bg-[#0a0c0a] text-[#e6ece4] antialiased selection:bg-[#7CFF6B] selection:text-black">
      <link
        href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        body { font-family: 'Space Grotesk', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .grid-bg {
          background-image:
            linear-gradient(rgba(124,255,107,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(124,255,107,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,255,107,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(124,255,107,0); }
        }
        .pulse-dot { animation: pulse-dot 2s ease-out infinite; }
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        .field { background: #101410; border: 1px solid #1f2a1f; transition: border-color .2s, box-shadow .2s; }
        .field:focus { outline: none; border-color: #7CFF6B; box-shadow: 0 0 0 3px rgba(124,255,107,0.12); }
        .field::placeholder { color: #4a5648; }
        ::-webkit-scrollbar { width: 10px; }
        ::-webkit-scrollbar-track { background: #0a0c0a; }
        ::-webkit-scrollbar-thumb { background: #1f2a1f; border-radius: 6px; }
      `,
        }}
      />

      {/* Top bar */}
      <header className="border-b border-[#1a211a]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[#7CFF6B] rounded-md flex items-center justify-center">
              <Activity className="w-4.5 h-4.5 text-black" strokeWidth={2.5} size={18} />
            </div>
            <span className="font-semibold text-[17px] tracking-tight">PulseGrid</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm text-[#9aa898]">
            <span className="hover:text-white cursor-pointer transition-colors">Product</span>
            <span className="hover:text-white cursor-pointer transition-colors">Docs</span>
            <span className="hover:text-white cursor-pointer transition-colors">Pricing</span>
            <span className="text-white">Contact</span>
          </nav>
          <div className="flex items-center gap-2 mono text-xs text-[#7CFF6B] bg-[#7CFF6B]/8 border border-[#7CFF6B]/20 px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7CFF6B] pulse-dot" />
            all systems operational
          </div>
        </div>
      </header>

      <main className="grid-bg">
        <div className="max-w-6xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-[1fr_460px] gap-16">
          {/* LEFT */}
          <div>
            <p className="mono text-[13px] text-[#7CFF6B] mb-4">// contact</p>
            <h1 className="text-[44px] md:text-[56px] leading-[1.02] font-semibold tracking-tight mb-6">
              Talk to the people
              <br />
              who page themselves.
            </h1>
            <p className="text-[#9aa898] text-lg leading-relaxed max-w-xl mb-12">
              Every message lands in the same Slack channel our on-call engineers live in.
              No ticket queues, no tier-one scripts — just answers from people who run
              the probes monitoring 4.2 billion requests a day.
            </p>

            {/* Channels */}
            <div className="space-y-3 mb-14">
              {CHANNELS.map((c) => (
                <div
                  key={c.title}
                  className="group flex items-start gap-4 p-5 rounded-xl border border-[#1a211a] bg-[#0e120e]/80 hover:border-[#2c3a2c] hover:bg-[#111611] transition-all cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#162016] border border-[#243024] flex items-center justify-center shrink-0 group-hover:border-[#7CFF6B]/40 transition-colors">
                    <c.icon size={18} className="text-[#7CFF6B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="font-medium text-[15px]">{c.title}</h3>
                      <span className="mono text-[11px] text-[#5d6b5b]">{c.meta}</span>
                    </div>
                    <p className="text-sm text-[#8a988a] mt-1">{c.desc}</p>
                    <span className="inline-flex items-center gap-1 mono text-[13px] text-[#7CFF6B] mt-2.5 group-hover:gap-2 transition-all">
                      {c.action}
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Live region latency */}
            <div className="rounded-xl border border-[#1a211a] bg-[#0c100c] overflow-hidden relative">
              <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-[#7CFF6B]/[0.03] to-transparent pointer-events-none" style={{ animation: 'scan 5s linear infinite' }} />
              <div className="px-5 py-3.5 border-b border-[#1a211a] flex items-center justify-between">
                <div className="flex items-center gap-2 mono text-xs text-[#9aa898]">
                  <Terminal size={13} className="text-[#7CFF6B]" />
                  contact-form.pulsegrid.dev — live probe latency
                </div>
                <span className="mono text-[11px] text-[#5d6b5b]">refreshed 2.4s ago</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[#1a211a]">
                {REGIONS.map((r, i) => (
                  <div key={r.code} className="px-5 py-4">
                    <div className="mono text-[11px] text-[#5d6b5b] mb-1">{r.code}</div>
                    <div className="flex items-baseline gap-1">
                      <span className="mono text-xl text-[#e6ece4]">{jitter(r.ms, i + 3)}</span>
                      <span className="mono text-xs text-[#5d6b5b]">ms</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#7CFF6B]" />
                      <span className="text-[11px] text-[#8a988a]">{r.city}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — form card */}
          <div className="lg:sticky lg:top-10 self-start">
            <div className="rounded-2xl border border-[#222c22] bg-[#0e120e] shadow-[0_24px_80px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="px-7 pt-7 pb-5 border-b border-[#1a211a] flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Send a message</h2>
                  <p className="mono text-[11px] text-[#5d6b5b] mt-1">POST /v1/contact · avg reply 3h 41m</p>
                </div>
                <Mail size={20} className="text-[#3c483b]" />
              </div>

              <AnimatePresence mode="wait">
                {!sent ? (
                  <motion.form
                    key="form"
                    onSubmit={handleSubmit}
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="p-7 space-y-5"
                  >
                    {/* topic pills */}
                    <div>
                      <label className="mono text-[11px] uppercase tracking-wider text-[#5d6b5b] block mb-2.5">
                        Topic
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {TOPICS.map((t) => (
                          <button
                            type="button"
                            key={t.id}
                            onClick={() => setTopic(t.id)}
                            className={`px-3.5 py-1.5 rounded-full text-[13px] border transition-all ${
                              topic === t.id
                                ? 'bg-[#7CFF6B] text-black border-[#7CFF6B] font-medium'
                                : 'border-[#243024] text-[#9aa898] hover:border-[#3a4a3a] hover:text-white'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mono text-[11px] uppercase tracking-wider text-[#5d6b5b] block mb-2">
                          Name
                        </label>
                        <input
                          required
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          placeholder="Ada Okafor"
                          className="field w-full rounded-lg px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                      <div>
                        <label className="mono text-[11px] uppercase tracking-wider text-[#5d6b5b] block mb-2">
                          Work email
                        </label>
                        <input
                          required
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          placeholder="ada@stripe.com"
                          className="field w-full rounded-lg px-3.5 py-2.5 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mono text-[11px] uppercase tracking-wider text-[#5d6b5b] block mb-2">
                        Company <span className="text-[#3c483b] normal-case">(optional)</span>
                      </label>
                      <input
                        value={form.company}
                        onChange={(e) => setForm({ ...form, company: e.target.value })}
                        placeholder="Acme Robotics"
                        className="field w-full rounded-lg px-3.5 py-2.5 text-sm text-white"
                      />
                    </div>

                    <div>
                      <label className="mono text-[11px] uppercase tracking-wider text-[#5d6b5b] block mb-2">
                        Message
                      </label>
                      <textarea
                        required
                        rows={5}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="We're monitoring ~140 endpoints across 3 regions and want to migrate off our current setup before Q3..."
                        className="field w-full rounded-lg px-3.5 py-2.5 text-sm text-white resize-none leading-relaxed"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-[#7CFF6B] hover:bg-[#92ff84] text-black font-semibold rounded-lg py-3 flex items-center justify-center gap-2 transition-all hover:shadow-[0_0_32px_-6px_rgba(124,255,107,0.5)] active:scale-[0.99]"
                    >
                      <Send size={16} />
                      Send message
                    </button>

                    <p className="text-[12px] text-[#5d6b5b] text-center leading-relaxed">
                      We'll never add you to a drip campaign.{' '}
                      <span className="text-[#8a988a]">One human reply, that's it.</span>
                    </p>
                  </motion.form>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-7 py-14 flex flex-col items-center text-center"
                  >
                    <div className="w-14 h-14 rounded-full bg-[#7CFF6B]/10 border border-[#7CFF6B]/30 flex items-center justify-center mb-5">
                      <CheckCircle2 size={26} className="text-[#7CFF6B]" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Message delivered</h3>
                    <p className="mono text-xs text-[#7CFF6B] mb-4">201 Created · id: msg_8x4kQ2nP</p>
                    <p className="text-sm text-[#8a988a] max-w-xs leading-relaxed">
                      An engineer (probably Priya or Marcus) will reply to{' '}
                      <span className="text-white">{form.email || 'your inbox'}</span> within a few
                      hours.
                    </p>
                    <button
                      onClick={() => {
                        setSent(false);
                        setForm({ name: '', email: '', company: '', message: '' });
                      }}
                      className="mt-7 mono text-xs text-[#7CFF6B] hover:underline underline-offset-4"
                    >
                      send another →
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* small footer facts */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { icon: Clock, label: '3h 41m', sub: 'median reply' },
                { icon: Globe, label: '14', sub: 'probe regions' },
                { icon: CheckCircle2, label: '99.99%', sub: '90-day uptime' },
              ].map((s) => (
                <div
                  key={s.sub}
                  className="rounded-xl border border-[#1a211a] bg-[#0c100c] px-4 py-3.5 flex flex-col gap-1"
                >
                  <s.icon size={14} className="text-[#5d6b5b]" />
                  <span className="mono text-[15px] text-white">{s.label}</span>
                  <span className="text-[11px] text-[#5d6b5b]">{s.sub}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1a211a]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="mono text-xs text-[#5d6b5b]">© 2025 PulseGrid Systems, Inc. — 548 Market St, San Francisco</p>
          <div className="flex items-center gap-6 text-xs text-[#8a988a]">
            <span className="hover:text-white cursor-pointer transition-colors">status.pulsegrid.dev</span>
            <span className="hover:text-white cursor-pointer transition-colors">Privacy</span>
            <span className="hover:text-white cursor-pointer transition-colors">SOC 2 report</span>
          </div>
        </div>
      </footer>
    </div>
    </>
  );
}