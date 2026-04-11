import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { 
  Bot, SquareTerminal, Download, Mic, Zap, 
  Server, ChevronRight, History, TerminalSquare, Loader2, CheckCircle2, Clock 
} from 'lucide-react';

function App() {
  // ── STATE & LOGIC (UNCHANGED) ──────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('Awaiting connection sequence...\n\nYour neural meeting insights will render here.');
  const [botId, setBotId] = useState(null);
  const [botStatus, setBotStatus] = useState('idle');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false); // For cursor expansion
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

  // ── CORE BACKEND FUNCTIONS (UNCHANGED) ─────────────────────────────────
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

        if (s === 'in_call') {
          setSummary("🟢 **Scribe AI is live in the meeting!**\n\nListening and transcribing...\n\nClick **Terminate & Extract** when the meeting ends.");
        } else if (s === 'joining' || s === 'waiting') {
          setSummary("🟡 **Bot is in the waiting room...**\n\nPlease admit **'Scribe AI'** from the Google Meet participants panel.");
        } else if (s === 'call_ended' || s === 'done') {
          clearInterval(pollRef.current);
          setSummary("📞 **Meeting ended.**\n\nClick **Terminate & Extract** to generate your AI summary.");
        }
      } catch (e) {
        console.log("Poll error:", e.message);
      }
    }, 5000);
  };

  const startBot = async () => {
    if (!url.includes('meet.google.com')) {
      alert("Please enter a valid Google Meet URL");
      return;
    }
    setIsRunning(true);
    setBotStatus('joining');
    setSummary("🚀 **Deploying Scribe AI Bot...**\n\nConnecting to Google Meet...");
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
        setSummary("🟡 **Bot is knocking on the meeting door...**\n\nPlease admit **'Scribe AI'** from your Google Meet waiting room.\n\nBot ID: `" + data.botId + "`");
        startPolling(data.botId);
      } else {
        setSummary("❌ **Error:** " + (data.error || "Bot failed to deploy."));
        setIsRunning(false);
        setBotStatus('idle');
      }
    } catch (error) {
      setSummary("❌ **Could not connect to AWS backend.**");
      setIsRunning(false);
      setBotStatus('idle');
    }
  };

  const stopBot = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    
    try {
      setSummary("🛑 **Stopping bot...**\n\nInstructing Scribe AI to leave the meeting.");
      await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', botId: botId }),
      });

      setSummary("⏳ **Processing Meeting Audio...**\n\nWaiting for Recall.ai to finalize the recording.");
      let audioUrl = null;
      for (let i = 0; i < 20; i++) { 
        const res = await fetch(AWS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_audio', botId: botId }),
        });
        const data = await res.json();
        if (data.status === 'ready' && data.audioUrl) {
          audioUrl = data.audioUrl;
          break;
        }
        await new Promise(r => setTimeout(r, 5000)); 
      }

      if (!audioUrl) throw new Error("Audio processing timed out.");

      setSummary("🎙️ **Starting Transcription...**\n\nSending high-fidelity audio to AssemblyAI.");
      const transRes = await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_transcription', audioUrl }),
      });
      const transData = await transRes.json();
      const transcriptId = transData.transcriptId;

      if (!transcriptId) throw new Error("Failed to start AssemblyAI transcription.");

      setSummary("📝 **Transcribing Meeting...**\n\nThis usually takes 30-60 seconds depending on meeting length.");
      let transcriptText = null;
      for (let i = 0; i < 30; i++) { 
        const checkRes = await fetch(AWS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_transcription', transcriptId }),
        });
        const checkData = await checkRes.json();
        
        if (checkData.status === 'completed' && checkData.transcript) {
          transcriptText = checkData.transcript;
          break;
        } else if (checkData.status === 'error') {
          throw new Error("AssemblyAI encountered an error while transcribing.");
        }
        await new Promise(r => setTimeout(r, 5000));
      }

      if (!transcriptText) throw new Error("Transcription timed out.");

      setSummary("🧠 **Generating Intelligence Report...**\n\nPassing extracted transcript to LLM engine.");
      const sumRes = await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', transcript: transcriptText }),
      });
      const sumData = await sumRes.json();

      const finalOutput = sumData.summary || "❌ Summary generation failed.";
      setSummary(finalOutput);

      if (sumData.summary) {
        setHistory(prev => [{
          id: Date.now(),
          date: new Date().toLocaleDateString() + ' • ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          text: sumData.summary,
          meetUrl: url || 'Meeting Instance'
        }, ...prev]);
      }

    } catch (error) {
      setSummary(`❌ **Error:** ${error.message}`);
    }

    setIsRunning(false);
    setBotId(null);
    setBotStatus('idle');
  };

  const downloadPDF = (textToDownload = summary) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Scribe AI Intelligence Report", 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    
    let cleanText = textToDownload.replace(/\*\*/g, '').replace(/#/g, '').replace(/[🧠✅📋🔜💬🟢🟡❌🚀📞⏳🎙️📝🛑]/g, '');
    
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(cleanText, 170);
    let cursorY = 40;
    for (let i = 0; i < lines.length; i++) {
      if (cursorY > 280) { doc.addPage(); cursorY = 20; }
      doc.text(lines[i], 20, cursorY);
      cursorY += 7;
    }
    doc.save(`ScribeAI_${Date.now()}.pdf`);
  };

  // ── NEW UI UX COMPONENTS ────────────────────────────────────────────────

  const StatusBadge = () => {
    const configs = {
      idle:      { text: 'text-white/60', bg: 'bg-white/[0.05]', border: 'border-white/[0.05]', label: 'SYSTEM STANDBY' },
      joining:   { text: 'text-orange-300', bg: 'bg-orange-500/[0.15]', border: 'border-orange-500/30', label: 'CONNECTING...' },
      waiting:   { text: 'text-orange-300', bg: 'bg-orange-500/[0.15]', border: 'border-orange-500/30', label: 'AWAITING ENTRY' },
      in_call:   { text: 'text-teal-300', bg: 'bg-teal-500/[0.15]', border: 'border-teal-500/30', label: 'UPLINK ACTIVE' },
      done:      { text: 'text-indigo-300', bg: 'bg-indigo-500/[0.15]', border: 'border-indigo-500/30', label: 'MEETING CONCLUDED' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${c.bg} border ${c.border} backdrop-blur-md transition-all shadow-[0_4px_12px_rgba(0,0,0,0.1)]`}>
        <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text-', 'bg-')} ${botStatus !== 'idle' ? 'animate-pulse' : ''}`} />
        <span className={`text-[10px] tracking-widest font-bold font-mono ${c.text}`}>{c.label}</span>
      </div>
    );
  };

  const PipelineStepper = () => {
    const steps = [
      { key: "Stopping", label: "Extract" },
      { key: "Audio", label: "Fetch" },
      { key: "Transcribing", label: "Neural STT" },
      { key: "Generating", label: "Synthesis" }
    ];

    let activeIndex = -1;
    steps.forEach((s, idx) => { if (summary.includes(s.key)) activeIndex = idx; });
    
    if (activeIndex === -1 && !summary.includes("Starting")) return null;
    if (summary.includes("❌") || (summary.length > 200 && !summary.includes("Generating"))) return null;

    return (
      <div className="flex items-center justify-between w-full mb-6 bg-white/[0.03] backdrop-blur-lg border border-white/[0.08] p-5 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.1)]">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex;
          const isPast = idx < activeIndex;
          return (
            <div key={step.key} className="flex flex-col items-center gap-3 flex-1 relative z-10">
              {idx !== steps.length - 1 && (
                <div className={`absolute top-4 left-1/2 w-full h-[1px] ${isPast ? 'bg-gradient-to-r from-cyan-400/50 to-transparent' : 'bg-white/5'}`} />
              )}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border shadow-lg transition-all ${
                isActive ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 scale-110 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 
                isPast ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-500' : 'bg-white/[0.02] border-white/10 text-white/20'
              }`}>
                {isPast ? <CheckCircle2 className="w-4 h-4" /> : isActive ? <Loader2 className="w-4 h-4 animate-spin" /> : <div className="w-1 h-1 rounded-full bg-white/20" />}
              </div>
              <span className={`text-[9px] uppercase tracking-[0.2em] font-mono font-bold ${isActive ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : isPast ? 'text-cyan-500/70' : 'text-white/30'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const hasSummary = summary.length > 100 && !summary.includes("Awaiting") && !summary.includes("Processing") && !summary.includes("Transcribing");

  return (
    <div className="min-h-screen bg-[#02040A] text-slate-100 font-sans overflow-hidden relative cursor-none flex items-center justify-center p-4 sm:p-8">

      {/* ── NEW VISCOM CURSOR ── */}
      <div 
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-white/30 z-[100] transition-all duration-300 ease-out flex items-center justify-center mix-blend-difference"
        style={{ transform: `translate(${mousePos.x - 16}px, ${mousePos.y - 16}px) scale(${hovered ? 1.5 : 1})` }}
      />
      <div 
        className="pointer-events-none fixed top-0 left-0 w-1.5 h-1.5 bg-white rounded-full z-[100] transition-transform duration-75 ease-out mix-blend-difference"
        style={{ transform: `translate(${mousePos.x - 3}px, ${mousePos.y - 3}px)` }}
      />

      {/* ── TRUE GLASSMORPHISM BACKGROUND ORBS ── */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-indigo-600/30 rounded-full mix-blend-screen filter blur-[100px] opacity-60 animate-pulse pointer-events-none" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] bg-teal-600/20 rounded-full mix-blend-screen filter blur-[120px] opacity-60 pointer-events-none" />
      <div className="absolute top-[40%] left-[40%] w-[30vw] h-[30vw] bg-fuchsia-600/10 rounded-full mix-blend-screen filter blur-[100px] pointer-events-none" />

      {/* ── MAIN FROSTED GLASS CONTAINER ── */}
      <div className="relative z-10 w-full max-w-5xl bg-white/[0.02] backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] rounded-[2rem] flex flex-col overflow-hidden">
        
        {/* Header Overlay */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-white/[0.05] bg-white/[0.01] p-6 sm:px-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-inner flex items-center justify-center backdrop-blur-md">
              <Bot className="w-6 h-6 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white/90">Scribe<span className="font-light text-white/50">_OS</span></h1>
              <p className="text-white/40 text-[9px] uppercase tracking-[0.25em] font-medium mt-0.5">Neural Architecture</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            <StatusBadge />
            <div className="h-6 w-px bg-white/10 mx-2 hidden sm:block" />
            <div className="flex bg-white/[0.03] border border-white/[0.05] p-1 rounded-xl backdrop-blur-md">
              <button 
                onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                onClick={() => setActiveTab('terminal')} 
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'terminal' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
              >
                <TerminalSquare className="w-4 h-4" /> Console
              </button>
              <button 
                onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                onClick={() => setActiveTab('vault')} 
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'vault' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
              >
                <History className="w-4 h-4" /> Vault
                {history.length > 0 && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[9px] ml-1">{history.length}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* ── CONSOLE VIEW ── */}
        {activeTab === 'terminal' && (
          <div className="p-6 sm:p-10 flex flex-col gap-8">
            
            {/* Input Row */}
            <div className="flex flex-col sm:flex-row gap-4 items-stretch relative z-20">
              <div className="flex-1 relative group">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Mic className="h-5 w-5 text-white/30 group-focus-within:text-cyan-300 transition-colors" />
                </div>
                <input
                  className="w-full bg-black/20 backdrop-blur-md border border-white/10 focus:border-cyan-400/50 rounded-2xl py-4 pl-14 pr-6 text-sm text-white placeholder-white/30 outline-none transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] disabled:opacity-50 font-mono focus:ring-4 focus:ring-cyan-500/10"
                  placeholder="Paste secure Meet URL here..."
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
                  className="bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40 px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] transition-all backdrop-blur-md flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.1)] hover:-translate-y-0.5"
                >
                  Initialize Uplink <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button 
                  onClick={stopBot}
                  onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                  className="bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/50 text-rose-300 px-8 py-4 rounded-2xl font-bold text-xs uppercase tracking-[0.15em] transition-all backdrop-blur-md flex items-center justify-center gap-3 shadow-[0_4px_14px_0_rgba(225,29,72,0.1)] hover:-translate-y-0.5"
                >
                  Extract Data <SquareTerminal className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Loading Stepper */}
            <PipelineStepper />

            {/* Output Buffer (Nested Glass Pane) */}
            <div className="relative group">
              <div className="bg-black/30 backdrop-blur-xl border border-white/[0.05] rounded-3xl shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)] flex flex-col overflow-hidden">
                <div className="bg-white/[0.02] border-b border-white/[0.05] px-6 py-4 flex justify-between items-center">
                  <h2 className="text-[10px] font-mono text-white/40 tracking-widest uppercase flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400/50 animate-pulse border border-cyan-200" /> Neural Output
                  </h2>
                  {hasSummary && (
                    <button 
                      onClick={() => downloadPDF()} 
                      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                      className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/80 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all border border-white/10 hover:border-white/20"
                    >
                      <Download className="w-3 h-3" /> Export Report
                    </button>
                  )}
                </div>
                <div className="p-8 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar">
                  <div className="text-white/70 leading-loose prose prose-invert prose-p:text-white/60 prose-headings:text-white/90 prose-strong:text-cyan-300 prose-li:text-white/60 max-w-none prose-headings:font-medium prose-h2:border-b prose-h2:border-white/5 prose-h2:pb-3 text-sm">
                    <ReactMarkdown className="animate-fade-in">{summary}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── VAULT / HISTORY VIEW ── */}
        {activeTab === 'vault' && (
          <div className="p-6 sm:p-10 min-h-[500px] max-h-[600px] overflow-y-auto custom-scrollbar">
            <h2 className="text-lg font-light text-white mb-8 flex items-center gap-3">
              <Server className="w-5 h-5 text-white/50" /> Intelligence Vault
            </h2>
            
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-white/20 mt-20 gap-4">
                <History className="w-12 h-12" />
                <p className="text-xs font-mono uppercase tracking-[0.2em]">Storage Array Empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-white/[0.02] backdrop-blur-md border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/10 p-6 rounded-3xl transition-all duration-300 group flex flex-col gap-5 shadow-[0_8px_24px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_32px_rgba(255,255,255,0.05)] hover:-translate-y-1">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-mono text-cyan-300 bg-cyan-400/10 border border-cyan-400/20 px-2 py-1 rounded w-max tracking-widest">
                          ID_{item.id.toString().slice(-6)}
                        </span>
                        <span className="text-[11px] text-white/40 flex items-center gap-1.5 tracking-wide">
                          <Clock className="w-3 h-3"/> {item.date}
                        </span>
                      </div>
                      <button 
                        onClick={() => downloadPDF(item.text)} 
                        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                        className="p-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/5 hover:border-white/20 rounded-xl transition-all"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-full h-px bg-white/[0.03]" />
                    <p className="text-xs text-white/50 line-clamp-3 leading-relaxed font-light">
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
        .animate-fade-in { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
      `}} />
    </div>
  );
}

export default App;