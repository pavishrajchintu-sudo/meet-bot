import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { useAuth } from "react-oidc-context";
import { 
  Bot, SquareTerminal, Download, Settings, Mic, Zap, Sparkles, 
  Server, ChevronRight, History, TerminalSquare, Loader2, CheckCircle2, Clock,
  LogIn, LogOut 
} from 'lucide-react';

function App() {
  const auth = useAuth();

  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('Awaiting connection sequence...\n\nYour neural meeting insights will render here.');
  const [botId, setBotId] = useState(null);
  const [botStatus, setBotStatus] = useState('idle');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('terminal'); 
  
  // History State
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('scribe_history');
    return saved ? JSON.parse(saved) : [];
  });

  const pollRef = useRef(null);
  
  const AWS_URL = "https://3qvwk9es55.execute-api.ap-south-1.amazonaws.com/";

  // --- NEW: Auth Header Helper ---
  // This automatically grabs the Cognito token to unlock your API Gateway
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      ...(auth.user?.id_token ? { 'Authorization': `Bearer ${auth.user.access_token}` } : {})
    };
  };

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

  // ── CORE LOGIC ──────────────────────────────────────────────
  const startPolling = (id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(AWS_URL, {
          method: 'POST',
          headers: getAuthHeaders(), // <-- Added Token
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
        headers: getAuthHeaders(), // <-- Added Token
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
        headers: getAuthHeaders(), // <-- Added Token
        body: JSON.stringify({ action: 'stop', botId: botId }),
      });

      setSummary("⏳ **Processing Meeting Audio...**\n\nWaiting for Recall.ai to finalize the recording.");
      let audioUrl = null;
      for (let i = 0; i < 20; i++) { 
        const res = await fetch(AWS_URL, {
          method: 'POST',
          headers: getAuthHeaders(), // <-- Added Token
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
        headers: getAuthHeaders(), // <-- Added Token
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
          headers: getAuthHeaders(), // <-- Added Token
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
        headers: getAuthHeaders(), // <-- Added Token
        body: JSON.stringify({ action: 'summarize', transcript: transcriptText }),
      });
      const sumData = await sumRes.json();

      const finalOutput = sumData.summary || "❌ Summary generation failed.";
      setSummary(finalOutput);

      // HISTORY RECORDING LOGIC
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

  const handleLogin = () => auth.signinRedirect();
  const handleLogout = () => auth.removeUser();

  const StatusBadge = () => {
    const configs = {
      idle:      { color: 'text-slate-500', bg: 'bg-white/5', border: 'border-white/10', label: 'SYSTEM STANDBY' },
      joining:   { color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-500/30', label: 'CONNECTING...' },
      waiting:   { color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-500/30', label: 'AWAITING ENTRY' },
      in_call:   { color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-500/30', label: 'UPLINK ACTIVE' },
      done:      { color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-500/30', label: 'MEETING CONCLUDED' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${c.bg} border ${c.border} shadow-sm backdrop-blur-sm transition-all`}>
        <div className={`w-2 h-2 rounded-full ${c.color.replace('text-', 'bg-')} ${botStatus !== 'idle' ? 'animate-pulse' : ''}`} />
        <span className={`text-[10px] tracking-widest font-bold font-mono ${c.color}`}>{c.label}</span>
      </div>
    );
  };

  const PipelineStepper = () => {
    const steps = [
      { key: "Stopping", label: "Extracting Bot" },
      { key: "Audio", label: "Fetching Media" },
      { key: "Transcribing", label: "Neural STT" },
      { key: "Generating", label: "LLM Synthesis" }
    ];

    let activeIndex = -1;
    steps.forEach((s, idx) => { if (summary.includes(s.key)) activeIndex = idx; });
    
    if (activeIndex === -1 && !summary.includes("Starting")) return null;
    if (summary.includes("❌") || (summary.length > 200 && !summary.includes("Generating"))) return null;

    return (
      <div className="flex items-center justify-between w-full mb-6 bg-white/[0.02] border border-white/5 p-4 rounded-xl">
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex;
          const isPast = idx < activeIndex;
          return (
            <div key={step.key} className="flex flex-col items-center gap-2 flex-1 relative">
              {idx !== steps.length - 1 && (
                <div className={`absolute top-3 left-1/2 w-full h-[2px] ${isPast ? 'bg-cyan-500/50' : 'bg-white/10'}`} />
              )}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 border ${
                isActive ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 animate-pulse' : 
                isPast ? 'bg-cyan-500 border-cyan-400 text-black' : 'bg-[#111] border-white/20 text-slate-500'
              }`}>
                {isPast ? <CheckCircle2 className="w-4 h-4" /> : isActive ? <Loader2 className="w-3 h-3 animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
              </div>
              <span className={`text-[10px] uppercase tracking-widest font-mono font-semibold ${isActive ? 'text-cyan-400' : isPast ? 'text-slate-300' : 'text-slate-600'}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const hasSummary = summary.length > 100 && !summary.includes("Awaiting") && !summary.includes("Processing") && !summary.includes("Transcribing");

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#050505] text-slate-200 font-sans overflow-hidden relative cursor-none flex items-center justify-center p-4">
        <div className="pointer-events-none fixed top-0 left-0 w-6 h-6 rounded-full border border-cyan-500/50 z-[100] transition-transform duration-75 ease-out flex items-center justify-center mix-blend-screen" style={{ transform: `translate(${mousePos.x - 12}px, ${mousePos.y - 12}px)` }}>
          <div className="w-1 h-1 bg-white rounded-full" />
        </div>
        <div className="absolute top-[-20%] left-[20%] w-[40vw] h-[40vw] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[10%] w-[30vw] h-[30vw] bg-violet-900/20 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[1.5rem] shadow-2xl flex flex-col items-center justify-center p-10 text-center">
          <div className="p-4 mb-6 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 rounded-2xl border border-white/10 shadow-inner">
            <Bot className="w-10 h-10 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-2">SCRIBE_OS</h1>
          <p className="text-slate-500 text-xs uppercase tracking-[0.2em] font-semibold mb-10">Restricted Access</p>
          
          <button onClick={handleLogin} className="w-full bg-white text-black hover:bg-slate-200 px-8 py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)] flex items-center justify-center gap-3">
            Authenticate <LogIn className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans overflow-hidden relative cursor-none flex items-center justify-center p-4 sm:p-8">

      <div
        className="pointer-events-none fixed top-0 left-0 w-6 h-6 rounded-full border border-cyan-500/50 z-[100] transition-transform duration-75 ease-out flex items-center justify-center mix-blend-screen"
        style={{ transform: `translate(${mousePos.x - 12}px, ${mousePos.y - 12}px)` }}
      >
        <div className="w-1 h-1 bg-white rounded-full" />
      </div>

      <div className="absolute top-[-20%] left-[20%] w-[40vw] h-[40vw] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[10%] w-[30vw] h-[30vw] bg-violet-900/20 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-5xl bg-[#0A0A0A] border border-white/10 rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden">
        
        <div className="flex flex-col sm:flex-row items-center justify-between border-b border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500/10 to-violet-500/10 rounded-xl border border-white/10">
              <Bot className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">SCRIBE_OS</h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-semibold">IIT Standards Architecture</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 mt-4 sm:mt-0">
            <StatusBadge />
            <div className="h-6 w-px bg-white/10 mx-2 hidden sm:block" />
            <button onClick={() => setActiveTab('terminal')} className={`p-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'terminal' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
              <TerminalSquare className="w-4 h-4" /> Console
            </button>
            <button onClick={() => setActiveTab('vault')} className={`p-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeTab === 'vault' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
              <History className="w-4 h-4" /> Vault <span className="bg-white/10 px-1.5 rounded text-[10px]">{history.length}</span>
            </button>
            
            <button onClick={handleLogout} className="ml-2 p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all border border-red-500/20 hover:border-red-500/50" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'terminal' && (
          <div className="p-8 flex flex-col gap-8">
            
            <div className="flex flex-col sm:flex-row gap-4 items-stretch">
              <div className="flex-1 relative group">
                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                  <Mic className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                </div>
                <input
                  className="w-full bg-[#111] border border-white/10 focus:border-cyan-500/50 rounded-xl py-4 pl-14 pr-6 text-sm text-slate-200 placeholder-slate-600 outline-none transition-all shadow-inner disabled:opacity-50 font-mono"
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isRunning}
                />
              </div>

              {!isRunning ? (
                <button onClick={startBot} disabled={!url}
                  className="bg-white text-black hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-white px-8 py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)] flex items-center justify-center gap-3">
                  Deploy Intelligence <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button onClick={stopBot}
                  className="bg-red-500/10 border border-red-500/50 hover:bg-red-500/20 text-red-400 px-8 py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-3">
                  Terminate & Extract <SquareTerminal className="w-4 h-4" />
                </button>
              )}
            </div>

            <PipelineStepper />

            <div className="relative group">
              <div className="bg-[#0C0C0C] border border-white/10 rounded-2xl shadow-inner flex flex-col overflow-hidden">
                <div className="bg-white/5 border-b border-white/5 px-6 py-3 flex justify-between items-center">
                  <h2 className="text-[10px] font-mono text-slate-400 tracking-widest uppercase flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" /> Output Buffer
                  </h2>
                  {hasSummary && (
                    <button onClick={() => downloadPDF()} className="flex items-center gap-2 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all border border-transparent hover:border-white/10">
                      <Download className="w-3 h-3" /> Export PDF
                    </button>
                  )}
                </div>
                <div className="p-8 min-h-[350px] max-h-[450px] overflow-y-auto custom-scrollbar">
                  <div className="text-slate-300 leading-relaxed prose prose-invert prose-p:text-slate-400 prose-headings:text-slate-100 prose-strong:text-cyan-300 prose-li:text-slate-400 max-w-none prose-headings:font-semibold prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2 text-sm">
                    <ReactMarkdown className="animate-fade-in">{summary}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'vault' && (
          <div className="p-8 min-h-[500px] max-h-[600px] overflow-y-auto custom-scrollbar bg-[#0A0A0A]">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-3">
              <Server className="w-5 h-5 text-cyan-400" /> Intelligence Vault
            </h2>
            
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-slate-600 mt-20 gap-4">
                <History className="w-12 h-12 opacity-20" />
                <p className="text-sm font-mono uppercase tracking-widest">Vault is empty</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-[#111] border border-white/5 hover:border-cyan-500/30 p-5 rounded-2xl transition-all group flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded w-max">ID: {item.id.toString().slice(-6)}</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1.5"><Clock className="w-3 h-3"/> {item.date}</span>
                      </div>
                      <button onClick={() => downloadPDF(item.text)} className="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all opacity-0 group-hover:opacity-100">
                        <Download className="w-4 h-4" />
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
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.4); }
      `}} />
    </div>
  );
}

export default App;