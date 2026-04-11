import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { 
  Bot, SquareTerminal, Download, Mic, Zap, 
  Server, ChevronRight, History, TerminalSquare, Loader2, CheckCircle2, Clock 
} from 'lucide-react';

function App() {
  // ── STATE & LOGIC (STRICTLY PRESERVED) ──────────────────────────────────
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('Awaiting deployment...\n\nYour meeting insights will materialize here.');
  const [botId, setBotId] = useState(null);
  const [botStatus, setBotStatus] = useState('idle');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false); // New state for cursor affordance
  const [activeTab, setActiveTab] = useState('terminal');
  
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('scribe_history');
    return saved ? JSON.parse(saved) : [];
  });

  const pollRef = useRef(null);
  const AWS_URL = "https://ofunwseaxkbz3koxygqfg3ve6y0skfxi.lambda-url.ap-south-1.on.aws/";

  useEffect(() => {
    const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    localStorage.setItem('scribe_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── CORE FUNCTIONS (PRESERVED) ──────────────────────────────────────────
  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(AWS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status', botId: id }),
        });
        const data = await res.json();
        const s = data.status || 'unknown';
        setBotStatus(s);
        if (s === 'in_call') setSummary("🟢 **Scribe AI uplink active.** Listening...");
      } catch (e) { console.log(e.message); }
    }, 5000);
  };

  const startBot = async () => {
    if (!url.includes('meet.google.com')) return alert("Enter a valid Meet URL");
    setIsRunning(true);
    setBotStatus('joining');
    setSummary("🚀 **Initializing bot deployment protocol...**");
    try {
      const response = await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', meetUrl: url }),
      });
      const data = await response.json();
      if (response.ok && data.botId) {
        setBotId(data.botId);
        startPolling(data.botId);
      }
    } catch (error) { setIsRunning(false); }
  };

  const stopBot = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      setSummary("🛑 **Termination protocol active. Extracting session data...**");
      await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'stop', botId: botId }) });
      setSummary("⏳ **Polling audio matrices from Recall.ai nodes...**");
      let audioUrl = null;
      for (let i = 0; i < 20; i++) {
        const res = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'get_audio', botId: botId }) });
        const data = await res.json();
        if (data.status === 'ready') { audioUrl = data.audioUrl; break; }
        await new Promise(r => setTimeout(r, 5000));
      }
      setSummary("🎙️ **Phonetic extraction active. Routing audio to AssemblyAI...**");
      const transRes = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'start_transcription', audioUrl }) });
      const { transcriptId } = await transRes.json();
      let transcriptText = null;
      for (let i = 0; i < 30; i++) {
        const check = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'check_transcription', transcriptId }) });
        const d = await check.json();
        if (d.status === 'completed') { transcriptText = d.transcript; break; }
        await new Promise(r => setTimeout(r, 5000));
      }
      setSummary("🧠 **Neural synthesis engaged. Finalizing Intelligence Report via Llama 3...**");
      const sumRes = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'summarize', transcript: transcriptText }) });
      const sumData = await sumRes.json();
      setSummary(sumData.summary);
      setHistory(prev => [{ id: Date.now(), text: sumData.summary, date: new Date().toLocaleString() }, ...prev]);
    } catch (e) { setSummary(`❌ **Critical Failure:** ${e.message}`); }
    setIsRunning(false); setBotId(null); setBotStatus('idle');
  };

  const downloadPDF = (text = summary) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Scribe AI Intelligence Report", 20, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 116, 139); doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    const lines = doc.splitTextToSize(text.replace(/[#*]/g, ''), 170); doc.setTextColor(30, 41, 59); doc.setFontSize(11); doc.text(lines, 20, 40);
    doc.save(`Report_${Date.now()}.pdf`);
  };

  // ── NEW NEON UI COMPONENTS ─────────────────────────────────────────────

  const StatusBadge = () => {
    const configs = {
      idle:      { text: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/30', label: 'STANDBY' },
      joining:   { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-500/50', label: 'DEPLOYING' },
      waiting:   { text: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-500/50', label: 'AWAITING ENTRY' },
      in_call:   { text: 'text-cyan-400',  bg: 'bg-cyan-400/10',  border: 'border-cyan-500/50',  label: 'UPLINK ACTIVE' },
      done:      { text: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-500/50', label: 'CALL ENDED' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${c.bg} border ${c.border} backdrop-blur-sm transition-all shadow-[0_0_10px_${c.text.replace('text-','rgba(').replace('-400',',1')})]`}>
        <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} ${botStatus !== 'idle' ? 'animate-pulse shadow-[0_0_5px_currentColor]' : ''}`} />
        <span className={`text-[10px] tracking-widest font-bold font-mono ${c.text}`}>{c.label}</span>
      </div>
    );
  };

  // Upgraded dynamic stepper with blur and glowing neon paths
  const PipelineStepper = () => {
    const steps = [
      { key: "Stopping", label: "Extraction" },
      { key: "Polling",  label: "Media Fetch" },
      { key: "Neural",   label: "Transcribe" },
      { key: "LLM",      label: "Synthesis" }
    ];
    let activeIndex = -1;
    steps.forEach((s, idx) => { if (summary.includes(s.key)) activeIndex = idx; });
    if (activeIndex === -1 && !summary.includes("Finalizing")) return null;

    return (
      <div className="flex items-center justify-between w-full mb-6 bg-white/[0.02] backdrop-blur-xl border border-white/[0.05] p-5 rounded-2xl shadow-[0_0_15px_rgba(34,211,238,0.1)]">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex || (idx === 3 && summary.includes("Finalizing"));
          const isPast = idx < activeIndex;
          return (
            <div key={step.key} className="flex flex-col items-center gap-2.5 flex-1 relative z-10">
              {idx !== steps.length - 1 && (
                <div className={`absolute top-4 left-1/2 w-full h-[1px] ${isPast ? 'bg-cyan-400/50 animate-pulse' : 'bg-white/5'} transition-all duration-500`} />
              )}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm border shadow-lg transition-all ${
                isActive ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 scale-110 shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 
                isPast ? 'bg-cyan-600/10 border-cyan-500/30 text-cyan-500' : 'bg-[#111] border-white/10 text-white/20'
              }`}>
                {isPast ? <CheckCircle2 className="w-4 h-4" /> : isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-1 h-1 rounded-full bg-white/20" />}
              </div>
              <span className={`text-[9px] uppercase tracking-widest font-mono font-bold ${isActive ? 'text-cyan-300' : isPast ? 'text-slate-500' : 'text-white/20'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const hasSummary = summary.length > 100 && !summary.includes("Awaiting") && !summary.includes("Deploying") && !summary.includes("Termination");

  return (
    <div className="min-h-screen bg-[#02040A] text-slate-100 font-sans overflow-hidden relative cursor-none flex items-center justify-center p-6">

      {/* ── HIGH-AFFORDANCE VISCOM CURSOR ── */}
      <div 
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-white/30 z-[100] transition-transform duration-150 ease-out flex items-center justify-center mix-blend-difference"
        style={{ transform: `translate(${mousePos.x - 16}px, ${mousePos.y - 16}px) scale(${hovered ? 1.6 : 1})` }}
      >
        <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
      </div>

      {/* ── DYNAMIC BACKGROUND BLUR AURORAS ── */}
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-fuchsia-900/30 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] bg-cyan-900/20 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* ── MAIN GLASS CONTAINER ── */}
      <div className="relative z-10 w-full max-w-4xl bg-white/[0.01] backdrop-blur-3xl border border-white/[0.05] rounded-[2.5rem] p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col gap-8 transition-all duration-1000">

        {/* Header Overlay */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl shadow-inner flex items-center justify-center backdrop-blur-md">
              <Bot className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]" />
            </div>
            <div>
              <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 flex items-center gap-3">
                Scribe<span className="font-light text-slate-500">_OS</span>
              </h1>
              <p className="text-slate-600 mt-1 text-xs uppercase tracking-[0.3em] font-medium flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-slate-700" /> Neural Meeting Uplink
              </p>
            </div>
          </div>
          <div className="flex bg-white/[0.02] p-1 rounded-full border border-white/5 backdrop-blur-md">
            <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => setActiveTab('terminal')} className={`px-5 py-2 rounded-full text-xs font-semibold tracking-widest uppercase transition-all flex items-center gap-2 ${activeTab === 'terminal' ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white'}`}>
              <TerminalSquare className="w-4 h-4" /> Console
            </button>
            <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => setActiveTab('vault')} className={`px-5 py-2 rounded-full text-xs font-semibold tracking-widest uppercase transition-all flex items-center gap-2 ${activeTab === 'vault' ? 'bg-cyan-500 text-black shadow-[0_0_15px_rgba(34,211,238,0.5)]' : 'text-slate-400 hover:text-white'}`}>
              <History className="w-4 h-4" /> Vault {history.length > 0 && <span className="text-[10px] ml-1.5 opacity-60">[{history.length}]</span>}
            </button>
          </div>
        </div>

        {activeTab === 'terminal' ? (
          <div className="flex flex-col gap-6">
            
            {/* Input Module */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch relative z-20">
              <div className="flex-1 relative group bg-white/[0.01] backdrop-blur-xl border border-white/[0.05] focus-within:border-cyan-400/50 rounded-2xl transition-all shadow-inner focus-within:ring-4 focus-within:ring-cyan-500/10">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Mic className="h-5 w-5 text-slate-600 group-focus-within:text-cyan-400 transition-colors drop-shadow-[0_0_3px_currentColor]" />
                </div>
                <input
                  className="w-full bg-transparent py-5 pl-14 pr-6 text-sm text-slate-100 placeholder-slate-600 outline-none disabled:opacity-50 font-mono tracking-tight"
                  placeholder="Insert secure meeting URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isRunning}
                />
              </div>

              {!isRunning ? (
                <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={startBot} disabled={!url}
                  className="bg-white hover:bg-slate-100 disabled:bg-white/[0.03] disabled:text-slate-700 disabled:opacity-50 disabled:border-white/5 disabled:shadow-none text-black px-8 py-5 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all transform hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2.5 whitespace-nowrap">
                  Initialize Uplink <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={stopBot}
                  className="bg-red-950/20 border border-red-500/50 hover:bg-red-950/30 text-red-300 px-8 py-5 rounded-2xl font-bold text-xs uppercase tracking-[0.2em] transition-all shadow-[0_0_30px_rgba(244,63,94,0.15)] active:scale-95 flex items-center justify-center gap-2.5 whitespace-nowrap">
                  Extract Data <SquareTerminal className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Loading Stepper */}
            <PipelineStepper />

            {/* Output Buffer (Nested Glass Pane) */}
            <div className="relative group">
              <div className="bg-black/20 backdrop-blur-xl border border-white/[0.03] rounded-3xl flex flex-col overflow-hidden shadow-inner">
                <div className="bg-white/[0.02] border-b border-white/[0.05] px-6 py-4 flex justify-between items-center">
                  <h2 className="text-[10px] font-mono text-slate-500 tracking-widest uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_5px_rgba(34,211,238,0.8)]" /> Intelligence Buffer
                  </h2>
                  <div className="flex items-center gap-3">
                    <StatusBadge />
                    {hasSummary && (
                      <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => downloadPDF()}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/5 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all">
                        <Download className="w-4 h-4 text-cyan-400 group-hover:-translate-y-1 transition-transform" /> PDF
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-8 min-h-[300px] max-h-[450px] overflow-y-auto custom-scrollbar">
                  <div className="text-slate-300 leading-relaxed prose prose-invert prose-p:text-slate-400 prose-headings:text-slate-100 prose-strong:text-cyan-300 prose-li:text-slate-400 max-w-none prose-headings:font-black prose-headings:tracking-tighter text-sm">
                    <ReactMarkdown className="animate-fade-in">{summary}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* VAULT HISTORY VIEW */
          <div className="min-h-[450px] max-h-[550px] overflow-y-auto custom-scrollbar p-1">
            <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-3">
              <Server className="w-5 h-5 text-cyan-400" /> Intelligence Vault
            </h2>
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-700 mt-24 gap-4">
                <History className="w-16 h-16Opacity-10" />
                <p className="text-xs font-mono uppercase tracking-widest">Memory banks empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-white/[0.02] backdrop-blur-md border border-white/[0.03] hover:border-white/10 p-6 rounded-2xl transition-all duration-300 group flex flex-col gap-5 shadow-[inset_0_0_10px_rgba(255,255,255,0.01)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded w-max tracking-widest">ID_{item.id.toString().slice(-6)}</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-600"/> {item.date}</span>
                      </div>
                      <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => downloadPDF(item.text)}
                        className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100">
                        <Download className="w-4 h-4 text-cyan-400" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">{item.text.replace(/#/g, '').replace(/\*/g, '')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.2); }
      `}} />
    </div>
  );
}

export default App;