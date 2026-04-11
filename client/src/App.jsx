import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { Bot, SquareTerminal, Download, Settings, Mic, Zap, Sparkles, Radio } from 'lucide-react';

function App() {
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('Awaiting deployment...\n\nYour meeting insights will materialize here.');
  const [botId, setBotId] = useState(null);
  const [botStatus, setBotStatus] = useState('idle');
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [depth, setDepth] = useState('bullet');
  const [showSettings, setShowSettings] = useState(false);
  const pollRef = useRef(null);

  const AWS_URL = "https://ofunwseaxkbz3koxygqfg3ve6y0skfxi.lambda-url.ap-south-1.on.aws/";

  useEffect(() => {
    const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

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
          setSummary("🟢 **Scribe AI is live in the meeting!**\n\nListening and transcribing...\n\nClick **Stop & Summarize** when the meeting ends.");
        } else if (s === 'joining' || s === 'waiting') {
          setSummary("🟡 **Bot is in the waiting room...**\n\nPlease admit **'Scribe AI'** from the Google Meet participants panel.");
        } else if (s === 'call_ended' || s === 'done') {
          clearInterval(pollRef.current);
          setSummary("📞 **Meeting ended.**\n\nClick **Stop & Summarize** to generate your AI summary.");
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

  // ── THE NEW ASYNC ORCHESTRATOR ─────────────────────────────────────────
  const stopBot = async () => {
    if (pollRef.current) clearInterval(pollRef.current);
    
    try {
      // Step 1: Tell Bot to Leave
      setSummary("🛑 **Stopping bot...**\n\nInstructing Scribe AI to leave the meeting.");
      await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', botId: botId }),
      });

      // Step 2: Poll for Audio URL
      setSummary("⏳ **Processing Meeting Audio...**\n\nWaiting for Recall.ai to finalize the recording.");
      let audioUrl = null;
      for (let i = 0; i < 20; i++) { // Try for ~100 seconds
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
        await new Promise(r => setTimeout(r, 5000)); // Wait 5s before asking again
      }

      if (!audioUrl) throw new Error("Audio processing timed out.");

      // Step 3: Start AssemblyAI Transcription
      setSummary("🎙️ **Starting Transcription...**\n\nSending high-fidelity audio to AssemblyAI.");
      const transRes = await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start_transcription', audioUrl }),
      });
      const transData = await transRes.json();
      const transcriptId = transData.transcriptId;

      if (!transcriptId) throw new Error("Failed to start AssemblyAI transcription.");

      // Step 4: Poll AssemblyAI for Text
      setSummary("📝 **Transcribing Meeting...**\n\nThis usually takes 30-60 seconds depending on meeting length.");
      let transcriptText = null;
      for (let i = 0; i < 30; i++) { // Try for ~150 seconds
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

      // Step 5: Summarize with Groq/LLM
      setSummary("🧠 **Generating Intelligence Report...**\n\nPassing extracted transcript to LLM engine.");
      const sumRes = await fetch(AWS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', transcript: transcriptText }),
      });
      const sumData = await sumRes.json();

      setSummary(sumData.summary || "❌ Summary generation failed.");

    } catch (error) {
      setSummary(`❌ **Error:** ${error.message}`);
    }

    // Cleanup and Reset UI
    setIsRunning(false);
    setBotId(null);
    setBotStatus('idle');
  };
  // ───────────────────────────────────────────────────────────────────────

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("Scribe AI Intelligence Summary", 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 20, 28);
    let cleanText = summary.replace(/\*\*/g, '').replace(/#/g, '').replace(/[🧠✅📋🔜💬🟢🟡❌🚀📞⏳🎙️📝]/g, '');
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(cleanText, 170);
    let cursorY = 40;
    for (let i = 0; i < lines.length; i++) {
      if (cursorY > 280) { doc.addPage(); cursorY = 20; }
      doc.text(lines[i], 20, cursorY);
      cursorY += 7;
    }
    doc.save("ScribeAI_Summary.pdf");
  };

  const StatusBadge = () => {
    const configs = {
      idle:      { color: 'text-slate-400', bg: 'bg-slate-400/10', dot: 'bg-slate-400',              label: 'Standby' },
      joining:   { color: 'text-yellow-400', bg: 'bg-yellow-400/10', dot: 'bg-yellow-400 animate-ping', label: 'Joining...' },
      waiting:   { color: 'text-yellow-400', bg: 'bg-yellow-400/10', dot: 'bg-yellow-400 animate-ping', label: 'Waiting Room' },
      in_call:   { color: 'text-green-400',  bg: 'bg-green-400/10',  dot: 'bg-green-400 animate-pulse', label: 'Live in Meeting' },
      done:      { color: 'text-blue-400',   bg: 'bg-blue-400/10',   dot: 'bg-blue-400',              label: 'Meeting Ended' },
      call_ended:{ color: 'text-blue-400',   bg: 'bg-blue-400/10',   dot: 'bg-blue-400',              label: 'Meeting Ended' },
    };
    const c = configs[botStatus] || configs.idle;
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${c.bg} border border-white/5`}>
        <div className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className={`text-xs font-semibold font-mono ${c.color}`}>{c.label}</span>
      </div>
    );
  };

  const hasSummary = summary.length > 50 && !summary.includes("Awaiting");

  return (
    <div className="min-h-screen bg-[#030712] text-white font-sans overflow-hidden relative cursor-none flex items-center justify-center p-6">

      {/* Custom Cursor */}
      <div
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-cyan-400 z-[100] transition-transform duration-75 ease-out flex items-center justify-center mix-blend-screen shadow-[0_0_15px_rgba(34,211,238,0.5)]"
        style={{ transform: `translate(${mousePos.x - 16}px, ${mousePos.y - 16}px)` }}
      >
        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping" />
      </div>

      {/* Aurora Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-cyan-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-purple-700/20 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-4xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-10 shadow-2xl flex flex-col gap-8">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-500 flex items-center gap-3">
              <Bot className="w-10 h-10 text-cyan-400" />
              Scribe.AI
            </h1>
            <p className="text-slate-400 mt-2 text-sm uppercase tracking-widest font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Intelligence Node Active
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge />
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all hover:scale-105"
            >
              <Settings className="w-6 h-6 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex gap-6">
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Output Mode</label>
              <div className="flex gap-2 bg-white/5 p-1 rounded-lg">
                <button onClick={() => setDepth('bullet')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${depth === 'bullet' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>Bullets</button>
                <button onClick={() => setDepth('para')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${depth === 'para' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'}`}>Paragraph</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Core Engine</label>
              <div className="w-full bg-white/5 py-2 px-4 rounded-lg text-sm text-cyan-400 font-mono border border-cyan-500/30 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Groq Llama-3
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Bot Provider</label>
              <div className="w-full bg-white/5 py-2 px-4 rounded-lg text-sm text-purple-400 font-mono border border-purple-500/30 flex items-center gap-2">
                <Radio className="w-4 h-4" /> Recall.ai + AssemblyAI
              </div>
            </div>
          </div>
        )}

        {/* How it works cards */}
        {botStatus === 'idle' && !hasSummary && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: <Zap className="w-5 h-5 text-cyan-400" />, step: "01", title: "Paste Meet URL", desc: "Drop in any Google Meet link" },
              { icon: <Bot className="w-5 h-5 text-purple-400" />, step: "02", title: "Admit the Bot", desc: "Accept 'Scribe AI' from waiting room" },
              { icon: <Sparkles className="w-5 h-5 text-pink-400" />, step: "03", title: "Get Summary", desc: "AI-generated insights instantly" },
            ].map(({ icon, step, title, desc }) => (
              <div key={step} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">{icon}<span className="text-xs font-mono text-slate-600">{step}</span></div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Input + Button */}
        <div className="flex gap-4 items-center">
          <div className="flex-1 relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mic className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            </div>
            <input
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 pl-12 pr-6 text-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all shadow-inner disabled:opacity-40"
              placeholder="https://meet.google.com/xxx-xxxx-xxx"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isRunning}
            />
          </div>

          {!isRunning ? (
            <button onClick={startBot} disabled={!url}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 px-8 py-5 rounded-2xl font-bold text-lg transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center gap-2 whitespace-nowrap">
              Initialize <Zap className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={stopBot}
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 px-8 py-5 rounded-2xl font-bold text-lg transition-all shadow-[0_0_20px_rgba(244,63,94,0.4)] flex items-center gap-2 whitespace-nowrap">
              Stop & Summarize <SquareTerminal className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Live indicator */}
        {botStatus === 'in_call' && (
          <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl px-5 py-3">
            <div className="flex gap-1 items-end">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-1 bg-green-400 rounded-full animate-bounce"
                  style={{ height: `${10 + (i % 3) * 6}px`, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
            <p className="text-green-400 text-sm font-semibold">Bot is live — transcribing your meeting in real-time</p>
          </div>
        )}

        {/* Summary Box */}
        <div className="relative">
          <div className="flex justify-between items-end mb-4 px-2">
            <h2 className="text-sm font-mono text-cyan-400 tracking-widest uppercase flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Intelligence Buffer
            </h2>
            {hasSummary && !summary.includes("Deploying") && !summary.includes("Generating") && !summary.includes("Processing") && !summary.includes("Transcribing") && !summary.includes("Stopping") && !summary.includes("Starting") && (
              <button onClick={downloadPDF}
                className="group flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:border-purple-500/50">
                <Download className="w-4 h-4 text-purple-400 group-hover:-translate-y-1 transition-transform" />
                Export (.PDF)
              </button>
            )}
          </div>
          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 shadow-inner min-h-[300px] max-h-[450px] overflow-y-auto custom-scrollbar">
            <div className="text-slate-300 leading-relaxed prose prose-invert prose-p:text-slate-300 prose-headings:text-white prose-strong:text-cyan-300 max-w-none">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.01); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(34,211,238,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.5); }
      `}} />
    </div>
  );
}

export default App;