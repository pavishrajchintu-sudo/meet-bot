import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { 
  Bot, SquareTerminal, Download, Mic,
  Server, ChevronRight, History, TerminalSquare, Loader2, CheckCircle2, Clock 
} from 'lucide-react';

function App() {
  // ── STATE & LOGIC (UNCHANGED) ──────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('System ready. Awaiting connection sequence...\n\nYour meeting insights will render here.');
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

  // ── LINEAR LIGHT / MONOCHROMATIC UI ──────────────────────────────────────

  const StatusBadge = () => {
    const configs = {
      idle:      { text: 'text-zinc-500', bg: 'bg-zinc-100', border: 'border-zinc-200/60', label: 'SYSTEM STANDBY' },
      joining:   { text: 'text-zinc-700', bg: 'bg-zinc-200', border: 'border-zinc-300', label: 'CONNECTING...' },
      waiting:   { text: 'text-zinc-700', bg: 'bg-zinc-200', border: 'border-zinc-300', label: 'AWAITING ENTRY' },
      in_call:   { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'UPLINK ACTIVE' },
      done:      { text: 'text-zinc-900', bg: 'bg-zinc-200', border: 'border-zinc-300', label: 'MEETING CONCLUDED' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${c.bg} border ${c.border} transition-colors`}>
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
      <div className="flex items-center justify-between w-full mb-6 bg-white border border-black/5 p-5 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex;
          const isPast = idx < activeIndex;
          return (
            <div key={step.key} className="flex flex-col items-center gap-3 flex-1 relative z-10">
              {idx !== steps.length - 1 && (
                <div className={`absolute top-3.5 left-1/2 w-full h-px ${isPast ? 'bg-blue-500' : 'bg-zinc-200'}`} />
              )}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center bg-white border transition-all z-10 ${
                isActive ? 'border-blue-500 text-blue-600 shadow-[0_0_0_4px_rgba(59,130,246,0.1)]' : 
                isPast ? 'border-zinc-900 text-zinc-900' : 'border-zinc-200 text-zinc-300'
              }`}>
                {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-zinc-200" />}
              </div>
              <span className={`text-[10px] uppercase tracking-widest font-mono font-semibold ${isActive ? 'text-blue-600' : isPast ? 'text-zinc-900' : 'text-zinc-400'}`}>
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
    <div className="min-h-screen bg-[#E4E4E7] text-zinc-800 font-sans overflow-hidden relative cursor-none flex items-center justify-center p-4 sm:p-8">

      {/* ── PRECISION GHOST CURSOR ── */}
      <div 
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-zinc-400/50 z-[100] transition-transform duration-200 ease-out flex items-center justify-center"
        style={{ transform: `translate(${mousePos.x - 16}px, ${mousePos.y - 16}px) scale(${hovered ? 1.4 : 1})` }}
      />
      <div 
        className="pointer-events-none fixed top-0 left-0 w-1.5 h-1.5 bg-zinc-800 rounded-full z-[100]"
        style={{ transform: `translate(${mousePos.x - 3}px, ${mousePos.y - 3}px)` }}
      />

      {/* ── MAIN WHITE CARD (LINEAR STYLE) ── */}
      <div className="relative z-10 w-full max-w-5xl bg-white border border-black/5 shadow-[0_8px_40px_rgba(0,0,0,0.04),0_1px_3px_rgba(0,0,0,0.02)] rounded-3xl flex flex-col overflow-hidden">
        
        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-black/5 bg-white p-6 sm:px-10">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-center">
              <Bot className="w-5 h-5 text-zinc-900" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">Scribe<span className="font-light text-zinc-500">_OS</span></h1>
              <p className="text-zinc-400 text-[9px] uppercase tracking-[0.2em] font-medium mt-0.5">IIT Base Architecture</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            <StatusBadge />
            <div className="h-6 w-px bg-zinc-200 mx-2 hidden sm:block" />
            <div className="flex bg-zinc-50 border border-zinc-200 p-1 rounded-xl">
              <button 
                onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                onClick={() => setActiveTab('terminal')} 
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'terminal' ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <TerminalSquare className="w-4 h-4" /> Console
              </button>
              <button 
                onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                onClick={() => setActiveTab('vault')} 
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${activeTab === 'vault' ? 'bg-white text-zinc-900 shadow-[0_1px_3px_rgba(0,0,0,0.05)] border border-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                <History className="w-4 h-4" /> Vault
                {history.length > 0 && <span className="bg-zinc-200 text-zinc-700 px-1.5 py-0.5 rounded text-[9px] ml-1">{history.length}</span>}
              </button>
            </div>
          </div>
        </div>

        {/* ── CONSOLE VIEW ── */}
        {activeTab === 'terminal' && (
          <div className="p-6 sm:p-10 flex flex-col gap-6 bg-[#FAFAFB]">
            
            {/* Input Row */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch relative z-20">
              <div className="flex-1 relative group bg-white border border-black/10 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.02)] focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mic className="h-5 w-5 text-zinc-400 group-focus-within:text-blue-500 transition-colors" />
                </div>
                <input
                  className="w-full bg-transparent py-4 pl-12 pr-6 text-sm text-zinc-900 placeholder-zinc-400 outline-none font-mono"
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
                  className="bg-zinc-900 hover:bg-black text-white disabled:opacity-40 disabled:hover:bg-zinc-900 px-8 py-4 rounded-xl font-bold text-xs uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-2 shadow-[0_4px_10px_rgba(0,0,0,0.1)] active:scale-95"
                >
                  Connect <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button 
                  onClick={stopBot}
                  onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-xs uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-3 shadow-[0_4px_14px_rgba(37,99,235,0.2)] active:scale-95"
                >
                  Process Output <SquareTerminal className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Loading Stepper */}
            <PipelineStepper />

            {/* Output Buffer */}
            <div className="bg-white border border-black/5 rounded-2xl shadow-[0_2px_10px_rgba(0,0,0,0.02)] flex flex-col overflow-hidden">
              <div className="bg-zinc-50/80 border-b border-black/5 px-6 py-3.5 flex justify-between items-center">
                <h2 className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase flex items-center gap-2">
                  <TerminalSquare className="w-3.5 h-3.5" /> Intelligence Buffer
                </h2>
                {hasSummary && (
                  <button 
                    onClick={() => downloadPDF()} 
                    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                    className="flex items-center gap-1.5 bg-white hover:bg-zinc-50 text-zinc-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-zinc-200 shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" /> Export PDF
                  </button>
                )}
              </div>
              <div className="p-8 min-h-[300px] max-h-[400px] overflow-y-auto custom-scrollbar">
                <div className="text-zinc-600 leading-relaxed prose prose-zinc prose-sm sm:prose-base max-w-none prose-headings:text-zinc-900 prose-headings:font-semibold prose-strong:text-zinc-900 prose-a:text-blue-600">
                  <ReactMarkdown className="animate-fade-in">{summary}</ReactMarkdown>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ── VAULT / HISTORY VIEW ── */}
        {activeTab === 'vault' && (
          <div className="p-6 sm:p-10 min-h-[500px] max-h-[600px] overflow-y-auto custom-scrollbar bg-[#FAFAFB]">
            <h2 className="text-lg font-semibold text-zinc-900 mb-8 flex items-center gap-2">
              <Server className="w-5 h-5 text-zinc-400" /> Intelligence Vault
            </h2>
            
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-zinc-400 mt-20 gap-4">
                <History className="w-12 h-12 opacity-50" />
                <p className="text-xs font-mono uppercase tracking-[0.1em]">Storage Array Empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-white border border-black/5 hover:border-black/10 p-6 rounded-2xl transition-all duration-200 group flex flex-col gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.04)]">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-mono font-bold text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded w-max tracking-widest">
                          ID_{item.id.toString().slice(-6)}
                        </span>
                        <span className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                          <Clock className="w-3 h-3"/> {item.date}
                        </span>
                      </div>
                      <button 
                        onClick={() => downloadPDF(item.text)} 
                        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
                        className="p-2 bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-900 border border-zinc-200 rounded-lg transition-all shadow-sm"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="w-full h-px bg-zinc-100" />
                    <p className="text-sm text-zinc-600 line-clamp-3 leading-relaxed">
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
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E4E4E7; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #D4D4D8; }
      `}} />
    </div>
  );
}

export default App;