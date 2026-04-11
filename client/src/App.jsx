import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { 
  Bot, SquareTerminal, Download, Mic,
  Server, ChevronRight, History, TerminalSquare, Loader2, CheckCircle2, Clock 
} from 'lucide-react';

function App() {
  // ── STATE & LOGIC (STRICTLY PRESERVED) ──────────────────────────────────
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('System ready // Awaiting neural deployment...');
  const [botId, setBotId] = useState(null);
  const [botStatus, setBotStatus] = useState('idle');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
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

  // ── CORE BACKEND FUNCTIONS ──────────────────────────────────────────────
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
        if (s === 'in_call') setSummary("🟢 **UPLINK ACTIVE** // Listening to audio stream...");
      } catch (e) { console.log(e.message); }
    }, 5000);
  };

  const startBot = async () => {
    if (!url.includes('meet.google.com')) return alert("Invalid Meet URL");
    setIsRunning(true);
    setBotStatus('joining');
    setSummary("🚀 **DEPLOYING SCRIBE_OS NODE...**");
    setActiveTab('terminal');
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
      setSummary("🛑 **TERMINATING SESSION...** // Initiating extraction protocol");
      await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'stop', botId: botId }) });
      
      setSummary("⏳ **SYNCING MEDIA PACKAGE...** // Polling server storage");
      let audioUrl = null;
      for (let i = 0; i < 20; i++) {
        const res = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'get_audio', botId: botId }) });
        const data = await res.json();
        if (data.status === 'ready') { audioUrl = data.audioUrl; break; }
        await new Promise(r => setTimeout(r, 5000));
      }

      setSummary("🎙️ **NEURAL STT PIPELINE...** // Transcribing high-fidelity audio");
      const transRes = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'start_transcription', audioUrl }) });
      const { transcriptId } = await transRes.json();
      
      let transcriptText = null;
      for (let i = 0; i < 30; i++) {
        const check = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'check_transcription', transcriptId }) });
        const d = await check.json();
        if (d.status === 'completed') { transcriptText = d.transcript; break; }
        await new Promise(r => setTimeout(r, 5000));
      }

      setSummary("🧠 **GENERATING LLM REPORT...** // Synthesizing intelligence payload");
      const sumRes = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'summarize', transcript: transcriptText }) });
      const sumData = await sumRes.json();
      
      setSummary(sumData.summary);
      setHistory(prev => [{ id: Date.now(), text: sumData.summary, date: new Date().toLocaleString() }, ...prev]);
    } catch (e) { setSummary(`❌ **CRITICAL FAILURE:** ${e.message}`); }
    setIsRunning(false); setBotId(null); setBotStatus('idle');
  };

  const downloadPDF = (text = summary) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Scribe AI Intelligence Report", 20, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 116, 139); doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    const lines = doc.splitTextToSize(text.replace(/[#*]/g, ''), 170); doc.setTextColor(30, 41, 59); doc.setFontSize(11); doc.text(lines, 20, 40);
    doc.save(`Report_${Date.now()}.pdf`);
  };

  // ── 3D NEON GLASS UI COMPONENTS ───────────────────────────────────────

  const StatusBadge = () => {
    const configs = {
      idle:      { text: 'text-blue-200', bg: 'bg-white/5', border: 'border-white/10', glow: '', label: 'STANDBY' },
      joining:   { text: 'text-cyan-300', bg: 'bg-cyan-500/20', border: 'border-cyan-400/50', glow: 'shadow-[0_0_15px_rgba(34,211,238,0.4)]', label: 'CONNECTING...' },
      waiting:   { text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/20', border: 'border-fuchsia-400/50', glow: 'shadow-[0_0_15px_rgba(217,70,239,0.4)]', label: 'AWAITING ENTRY' },
      in_call:   { text: 'text-blue-300', bg: 'bg-blue-500/20', border: 'border-blue-400/50', glow: 'shadow-[0_0_15px_rgba(59,130,246,0.4)]', label: 'UPLINK ACTIVE' },
      done:      { text: 'text-purple-300', bg: 'bg-purple-500/20', border: 'border-purple-400/50', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.4)]', label: 'MEETING CONCLUDED' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${c.bg} border ${c.border} ${c.glow} backdrop-blur-md transition-all duration-300`}>
        <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} ${botStatus !== 'idle' ? 'animate-pulse shadow-[0_0_8px_currentColor]' : ''}`} />
        <span className={`text-[10px] tracking-widest font-bold font-mono ${c.text}`}>{c.label}</span>
      </div>
    );
  };

  const PipelineStepper = () => {
    const steps = [
      { key: "Stopping", label: "Extract" },
      { key: "SYNCING", label: "Media" },
      { key: "NEURAL",   label: "Transcribe" },
      { key: "GENERATING", label: "Synthesis" }
    ];
    let activeIndex = -1;
    steps.forEach((s, idx) => { if (summary.includes(s.key)) activeIndex = idx; });
    if (activeIndex === -1 && !summary.includes("Finalizing")) return null;

    return (
      <div className="flex gap-1 w-full mb-8 bg-black/20 p-4 rounded-2xl border border-white/10 backdrop-blur-md shadow-inner">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex || (idx === 3 && summary.includes("Finalizing"));
          const isPast = idx < activeIndex;
          return (
            <div key={step.key} className="flex-1 flex flex-col items-center gap-2 relative z-10">
              {idx !== steps.length - 1 && (
                <div className={`absolute top-3.5 left-1/2 w-full h-px ${isPast ? 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]' : 'bg-white/10'} transition-all duration-500`} />
              )}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${
                isActive ? 'bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.6)] text-white scale-110' : 
                isPast ? 'bg-white/10 border border-cyan-500/50 text-cyan-400' : 'bg-white/5 border border-white/10 text-white/30'
              }`}>
                {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-white/20" />}
              </div>
              <span className={`text-[9px] uppercase tracking-widest font-mono font-bold ${isActive ? 'text-cyan-300 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]' : isPast ? 'text-slate-300' : 'text-slate-600'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const hasSummary = summary.length > 100 && !summary.includes("Awaiting") && !summary.includes("DEPLOYING") && !summary.includes("TERMINATING");

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans overflow-hidden relative cursor-none flex items-center justify-center p-4 sm:p-8">

      {/* ── 3D NEON GHOST CURSOR ── */}
      <div 
        className="pointer-events-none fixed top-0 left-0 w-10 h-10 rounded-full border-2 border-white/40 z-[100] transition-all duration-200 ease-out flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.3)] mix-blend-screen"
        style={{ transform: `translate(${mousePos.x - 20}px, ${mousePos.y - 20}px) scale(${hovered ? 1.4 : 1})` }}
      />
      <div 
        className="pointer-events-none fixed top-0 left-0 w-2 h-2 bg-cyan-300 rounded-full z-[100] shadow-[0_0_10px_#67e8f9]"
        style={{ transform: `translate(${mousePos.x - 4}px, ${mousePos.y - 4}px)` }}
      />

      {/* ── CINEMATIC BLURRED BACKGROUND ── */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-800 via-[#09090b] to-[#09090b] opacity-80" />
      <div className="absolute top-[-10%] left-[-5%] w-[40vw] h-[40vw] bg-purple-600/20 blur-[120px] rounded-full mix-blend-screen animate-pulse pointer-events-none" style={{ animationDuration: '6s' }} />
      <div className="absolute bottom-[-10%] right-[-5%] w-[50vw] h-[50vw] bg-blue-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" style={{ animationDuration: '8s' }} />

      {/* ── 3D THICK GLASS MAIN BLOCK ── */}
      <div className="relative z-10 w-full max-w-4xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-purple-600/20 backdrop-blur-2xl rounded-[2.5rem] flex flex-col overflow-hidden transition-all duration-700
        border border-white/20 
        shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.4),inset_0_0_20px_rgba(255,255,255,0.05)]">
        
        {/* Edge highlights */}
        <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent opacity-80" />
        <div className="absolute left-0 inset-y-0 w-[1px] bg-gradient-to-b from-cyan-300/40 to-transparent opacity-50" />

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-white/10 bg-white/[0.02] p-8 relative z-20">
          <div className="flex items-center gap-5">
            <div className="p-3 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-[0_10px_20px_rgba(37,99,235,0.4),inset_0_2px_4px_rgba(255,255,255,0.4)] border border-blue-400/50">
              <Bot className="w-8 h-8 text-white drop-shadow-md" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
                Scribe<span className="font-light text-cyan-200">_OS</span>
              </h1>
              <p className="text-blue-200 mt-1 text-[10px] uppercase tracking-[0.3em] font-bold flex items-center gap-2 drop-shadow-sm">
                <Server className="w-3.5 h-3.5 text-cyan-400" /> Neural Architecture
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            <StatusBadge />
            <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block" />
            <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10 shadow-inner">
              <button 
                onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                onClick={() => setActiveTab('terminal')} 
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 uppercase tracking-widest ${activeTab === 'terminal' ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.2)] border border-cyan-400/30' : 'text-slate-400 hover:text-white border border-transparent'}`}
              >
                <TerminalSquare className="w-4 h-4" /> Console
              </button>
              <button 
                onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                onClick={() => setActiveTab('vault')} 
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 uppercase tracking-widest ${activeTab === 'vault' ? 'bg-gradient-to-r from-purple-500/20 to-fuchsia-600/20 text-fuchsia-300 shadow-[0_0_15px_rgba(217,70,239,0.2)] border border-fuchsia-400/30' : 'text-slate-400 hover:text-white border border-transparent'}`}
              >
                <History className="w-4 h-4" /> Vault
                {history.length > 0 && <span className="bg-white/10 text-white px-1.5 py-0.5 rounded-md text-[9px] ml-1">{history.length}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* ── CONSOLE VIEW ── */}
        {activeTab === 'terminal' && (
          <div className="p-8 sm:p-10 flex flex-col gap-6 relative z-20">
            
            {/* Input Row */}
            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              <div className="flex-1 relative group bg-black/30 border border-white/10 rounded-2xl shadow-inner focus-within:border-cyan-400 focus-within:shadow-[0_0_20px_rgba(34,211,238,0.2)] transition-all">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Mic className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors drop-shadow-[0_0_5px_currentColor]" />
                </div>
                <input
                  className="w-full bg-transparent py-5 pl-14 pr-6 text-base text-white placeholder-slate-500 outline-none disabled:opacity-50 font-mono tracking-wide"
                  placeholder="Insert secure Meet URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isRunning}
                  onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                />
              </div>

              {!isRunning ? (
                <button 
                  onClick={startBot} disabled={!url}
                  onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                  className="bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-black disabled:opacity-40 px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all transform hover:-translate-y-1 shadow-[0_10px_20px_rgba(37,99,235,0.4)] flex items-center justify-center gap-3 border border-cyan-200/50"
                >
                  Deploy <ChevronRight className="w-5 h-5" />
                </button>
              ) : (
                <button 
                  onClick={stopBot}
                  onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                  className="bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-400 hover:to-purple-500 text-white px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] transition-all transform hover:-translate-y-1 shadow-[0_10px_20px_rgba(239,68,68,0.4)] flex items-center justify-center gap-3 border border-red-300/50"
                >
                  <Loader2 className="w-5 h-5 animate-spin drop-shadow-md" /> Extract
                </button>
              )}
            </div>

            <PipelineStepper />

            {/* Output Buffer Box */}
            <div className="bg-black/40 border border-white/10 rounded-[2rem] shadow-inner flex flex-col overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
              
              <div className="border-b border-white/10 px-8 py-5 flex justify-between items-center bg-white/[0.02]">
                <h2 className="text-[10px] font-bold text-cyan-400 tracking-[0.2em] uppercase flex items-center gap-3 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]">
                  <TerminalSquare className="w-4 h-4" /> Intelligence Output
                </h2>
                {hasSummary && (
                  <button 
                    onClick={() => downloadPDF()} 
                    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                    className="flex items-center gap-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                  >
                    <Download className="w-3.5 h-3.5" /> Export PDF
                  </button>
                )}
              </div>
              <div className="p-8 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar relative z-10">
                <div className="text-slate-300 leading-loose prose prose-invert prose-sm sm:prose-base max-w-none prose-headings:text-white prose-headings:font-bold prose-strong:text-cyan-300 prose-a:text-blue-400">
                  <ReactMarkdown className="animate-fade-in">{summary}</ReactMarkdown>
                </div>
              </div>
            </div>

          </div>
        )  (
          /* VAULT HISTORY VIEW */
          <div className="p-8 sm:p-10 min-h-[500px] max-h-[600px] overflow-y-auto custom-scrollbar relative z-20">
            <h2 className="text-xl font-bold text-white mb-8 flex items-center gap-3 drop-shadow-md">
              <Server className="w-6 h-6 text-fuchsia-400" /> Intelligence Vault
            </h2>
            
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-white/30 mt-20 gap-4">
                <History className="w-16 h-16 drop-shadow-lg" />
                <p className="text-sm font-mono uppercase tracking-[0.2em]">Storage Array Empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-black/30 border border-white/10 hover:border-fuchsia-400/50 p-6 rounded-3xl transition-all duration-300 group flex flex-col gap-4 shadow-inner hover:shadow-[0_0_25px_rgba(217,70,239,0.15)] transform hover:-translate-y-1 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/20 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                    
                    <div className="flex justify-between items-start relative z-10">
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-mono font-bold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-2.5 py-1 rounded-md w-max tracking-[0.1em] shadow-[0_0_10px_rgba(217,70,239,0.2)]">
                          ID_{item.id.toString().slice(-6)}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5"/> {item.date}</span>
                      </div>
                      <button 
                        onClick={() => downloadPDF(item.text)} 
                        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                        className="p-3 bg-white/5 hover:bg-fuchsia-500/20 text-slate-400 hover:text-fuchsia-300 border border-white/10 hover:border-fuchsia-400/50 rounded-xl transition-all shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-full h-px bg-white/5 relative z-10" />
                    <p className="text-sm text-slate-300 line-clamp-3 leading-relaxed relative z-10">
                      {item.text.replace(/#/g, '').replace(/\*/g, '')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; border: 1px solid rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.4); box-shadow: 0 0 10px rgba(34,211,238,0.5); }
      `}} />
    </div>
  );
}

export default App;