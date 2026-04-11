import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { 
  Bot, SquareTerminal, Download, Mic,
  Server, ChevronRight, History, TerminalSquare, Loader2, CheckCircle2, Clock 
} from 'lucide-react';

function App() {
  // ── STATE & LOGIC (PRESERVED) ──────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('System ready // Awaiting deployment...');
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
        if (s === 'in_call') setSummary("UPLINK ACTIVE // LISTENING AND TRANSCRIBING stream");
      } catch (e) { console.log(e.message); }
    }, 5000);
  };

  const startBot = async () => {
    if (!url.includes('meet.google.com')) return alert("Invalid Meet URL");
    setIsRunning(true);
    setBotStatus('joining');
    setSummary("DEPLOYING SCRIBE_OS INTELLIGENCE NODE...");
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
      setSummary("TERMINATING SESSION... // INITIATING DATA EXTRACTION");
      await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'stop', botId: botId }) });
      setSummary("SYNCING MEDIA PACKAGE... // FETCHING Recall.ai recording link");
      let audioUrl = null;
      for (let i = 0; i < 20; i++) {
        const res = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'get_audio', botId: botId }) });
        const data = await res.json();
        if (data.status === 'ready') { audioUrl = data.audioUrl; break; }
        await new Promise(r => setTimeout(r, 5000));
      }
      setSummary("NEURAL STT PIPELINE... // ROUTING HIGH-FIDELITY AUDIO TO AssemblyAI");
      const transRes = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'start_transcription', audioUrl }) });
      const { transcriptId } = await transRes.json();
      let transcriptText = null;
      for (let i = 0; i < 30; i++) {
        const check = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'check_transcription', transcriptId }) });
        const d = await check.json();
        if (d.status === 'completed') { transcriptText = d.transcript; break; }
        await new Promise(r => setTimeout(r, 5000));
      }
      setSummary("GENERATING LLM REPORT... // SYNTESIZING Groq Llama-3 INTELLIGENCE");
      const sumRes = await fetch(AWS_URL, { method: 'POST', body: JSON.stringify({ action: 'summarize', transcript: transcriptText }) });
      const sumData = await sumRes.json();
      setSummary(sumData.summary);
      setHistory(prev => [{ id: Date.now(), text: sumData.summary, date: new Date().toLocaleString() }, ...prev]);
    } catch (e) { setSummary(`❌ FAILURE: ${e.message}`); }
    setIsRunning(false); setBotId(null); setBotStatus('idle');
  };

  const downloadPDF = (text = summary) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.text("Scribe AI Intelligence Report", 20, 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(100, 116, 139); doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    const lines = doc.splitTextToSize(text.replace(/[#*]/g, ''), 170); doc.setTextColor(30, 41, 59); doc.setFontSize(11); doc.text(lines, 20, 40);
    doc.save(`Report_${Date.now()}.pdf`);
  };

  // ── LINEAR Standard VisCom Components ─────────────────────────────────

  const StatusBadge = () => {
    const configs = {
      idle:      { text: 'text-zinc-500', bg: 'bg-zinc-100', border: 'border-zinc-200/50', label: 'STANDBY' },
      joining:   { text: 'text-zinc-800', bg: 'bg-zinc-200', border: 'border-zinc-300/50', label: 'CONNECTING...' },
      waiting:   { text: 'text-zinc-800', bg: 'bg-zinc-200', border: 'border-zinc-300/50', label: 'AWAITING ENTRY' },
      in_call:   { text: 'text-blue-600', bg: 'bg-blue-50',  border: 'border-blue-200/50', label: 'UPLINK ACTIVE' },
      done:      { text: 'text-zinc-900', bg: 'bg-zinc-300', border: 'border-zinc-400/50', label: 'MEETING CONCLUDED' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${c.bg} border ${c.border} shadow-sm transition-all`}>
        <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} ${botStatus !== 'idle' ? 'animate-pulse' : ''}`} />
        <span className={`text-[10px] tracking-widest font-bold font-mono ${c.text}`}>{c.label}</span>
      </div>
    );
  };

  // Upgraded dynamic stepper with matte, monochromatic lines and blue accent focus
  const PipelineStepper = () => {
    const steps = [
      { key: "Stopping", label: "Extract" },
      { key: "FETCHING", label: "Media" },
      { key: "NEURAL",   label: "Transcribe" },
      { key: "GENERATING", label: "Synthesis" }
    ];
    let activeIndex = -1;
    steps.forEach((s, idx) => { if (summary.includes(s.key)) activeIndex = idx; });
    if (activeIndex === -1 && !summary.includes("Finalizing")) return null;

    return (
      <div className="flex gap-1 w-full mb-8">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex || (idx === 3 && summary.includes("Finalizing"));
          const isPast = idx < activeIndex;
          return (
            <div key={step.key} className="flex-1 flex flex-col gap-2">
              <div className={`h-1.5 rounded-sm transition-all duration-500 ${isPast ? 'bg-zinc-900' : isActive ? 'bg-blue-600 animate-pulse' : 'bg-zinc-200'}`} />
              <span className={`text-[9px] uppercase tracking-[0.2em] font-mono font-bold ${isActive ? 'text-zinc-900' : isPast ? 'text-zinc-700' : 'text-zinc-400'}`}>
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
    <div className="min-h-screen bg-[#18181B] text-zinc-900 font-sans overflow-hidden relative cursor-none flex items-center justify-center p-4 sm:p-8">

      {/* ── HIGH-AFFORDANCE PRECISION GHOST CURSOR ── */}
      <div 
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-zinc-500 z-[100] transition-all duration-150 ease-out flex items-center justify-center mix-blend-difference"
        style={{ transform: `translate(${mousePos.x - 16}px, ${mousePos.y - 16}px) scale(${hovered ? 1.5 : 1})` }}
      />
      <div 
        className="pointer-events-none fixed top-0 left-0 w-1.5 h-1.5 bg-white rounded-full z-[100]"
        style={{ transform: `translate(${mousePos.x - 3}px, ${mousePos.y - 3}px)` }}
      />

      {/* ── MAIN WHITE CONTAINER (LINEAR STYLE) ── */}
      <div className="relative z-10 w-full max-w-5xl bg-white border border-black/5 shadow-[0_8px_40px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] rounded-3xl flex flex-col overflow-hidden">
        
        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-black/5 bg-white p-6 sm:px-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-center shadow-inner">
              <Bot className="w-7 h-7 text-zinc-900" />
            </div>
            <div>
              <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-zinc-950 to-zinc-600 flex items-center gap-3">
                Scribe<span className="font-light text-zinc-500">_OS</span>
              </h1>
              <p className="text-zinc-500 mt-1.5 text-xs uppercase tracking-[0.25em] font-medium flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-zinc-600" /> IIT Base Architecture
              </p>
            </div>
          </div>
          <div className="flex bg-zinc-50 p-1 rounded-full border border-zinc-200">
            <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => setActiveTab('terminal')} className={`px-6 py-2 rounded-full text-xs font-semibold tracking-widest uppercase transition-all flex items-center gap-2 ${activeTab === 'terminal' ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)]' : 'text-zinc-500 hover:text-zinc-700'}`}>
              <TerminalSquare className="w-4 h-4" /> Console
            </button>
            <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => setActiveTab('vault')} className={`px-6 py-2 rounded-full text-xs font-semibold tracking-widest uppercase transition-all flex items-center gap-2 ${activeTab === 'vault' ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)]' : 'text-zinc-500 hover:text-zinc-700'}`}>
              <History className="w-4 h-4" /> Vault {history.length > 0 && <span className="text-[10px] ml-1.5 text-zinc-400">[{history.length}]</span>}
            </button>
          </div>
        </div>

        {activeTab === 'terminal' ? (
          <div className="p-6 sm:p-10 flex flex-col gap-6 bg-[#FAFAFB]">
            
            {/* Input Module */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch relative z-20">
              <div className="flex-1 relative group bg-white border border-black/10 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Mic className="h-5 w-5 text-zinc-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  className="w-full bg-transparent py-5 pl-14 pr-6 text-base text-zinc-950 placeholder-zinc-400 outline-none disabled:opacity-50 font-mono tracking-tight"
                  placeholder="Insert secure meeting URL..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isRunning}
                  onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                />
              </div>

              {!isRunning ? (
                <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={startBot} disabled={!url}
                  className="bg-zinc-900 hover:bg-black text-white disabled:opacity-40 px-8 py-5 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] transition-all transform hover:-translate-y-0.5 shadow-[0_4px_10px_rgba(0,0,0,0.15)] flex items-center justify-center gap-3">
                  Deploy Intelligence <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={stopBot}
                  className="bg-red-500/10 border border-red-500/50 hover:bg-red-500/20 text-red-400 px-8 py-5 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] transition-all shadow-[0_4px_10px_rgba(244,63,94,0.1)] flex items-center justify-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin" /> Extract Data
                </button>
              )}
            </div>

            {/* Loading Stepper */}
            <PipelineStepper />

            {/* Output Buffer (Nested Glass Pane) */}
            <div className="bg-white border border-black/5 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
              <div className="bg-zinc-50 border-b border-black/5 px-6 py-4 flex justify-between items-center">
                <h2 className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase flex items-center gap-2">
                  <TerminalSquare className="w-3.5 h-3.5" /> Intelligence Output
                </h2>
                <div className="flex items-center gap-3">
                  <StatusBadge />
                  {hasSummary && (
                    <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => downloadPDF()}
                      className="flex items-center gap-2 hover:bg-zinc-100 text-zinc-900 border border-zinc-200 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all">
                      <Download className="w-3.5 h-3.5" /> PDF
                    </button>
                  )}
                </div>
              </div>
              <div className="p-8 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar">
                <div className="text-zinc-600 leading-relaxed prose prose-zinc prose-sm sm:prose-base max-w-none prose-headings:text-zinc-950 prose-headings:font-bold prose-strong:text-zinc-950 prose-a:text-blue-600">
                  <ReactMarkdown className="animate-fade-in">{summary}</ReactMarkdown>
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* VAULT HISTORY VIEW */
          <div className="p-6 sm:p-10 min-h-[500px] max-h-[600px] overflow-y-auto custom-scrollbar bg-[#FAFAFB]">
            <h2 className="text-lg font-semibold text-zinc-900 mb-8 flex items-center gap-2">
              <Server className="w-5 h-5 text-zinc-400" /> Intelligence Vault
            </h2>
            
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-zinc-400 mt-20 gap-4">
                <History className="w-12 h-12 opacity-50" />
                <p className="text-xs font-mono uppercase tracking-[0.1em]">Memory Banks Empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-white border border-black/5 hover:border-black/10 p-6 rounded-2xl transition-all duration-300 group flex flex-col gap-5 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.04)]">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-zinc-600 bg-zinc-100 border border-zinc-200 px-2.5 py-1 rounded w-max tracking-widest">ID_{item.id.toString().slice(-6)}</span>
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-zinc-600"/> {item.date}</span>
                      </div>
                      <button onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onClick={() => downloadPDF(item.text)}
                        className="p-3 bg-white hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 border border-zinc-200 rounded-xl transition-all shadow-sm">
                        <Download className="w-4 h-4 text-blue-600" />
                      </button>
                    </div>
                    <div className="w-full h-px bg-zinc-100" />
                    <p className="text-xs text-zinc-600 line-clamp-3 leading-relaxed">
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
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
      `}} />
    </div>
  );
}

export default App;