import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from "jspdf";
import { Bot, SquareTerminal, Download, Settings, Mic, Zap, Sparkles } from 'lucide-react';

function App() {
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('Awaiting deployment...\n\nYour meeting insights will materialize here.');
  
  // Custom UI States
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [depth, setDepth] = useState('bullet'); // bullet or paragraph
  const [showSettings, setShowSettings] = useState(false);

  // Custom Cursor Tracking
  useEffect(() => {
    const handleMouseMove = (e) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const startBot = async () => {
    setIsRunning(true);
    // WIRED TO RENDER BACKEND
    await fetch('https://meet-bot-8crl.onrender.com/api/deploy-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetUrl: url }),
    });
  };

  const stopBot = async () => {
    setIsRunning(false);
    // WIRED TO RENDER BACKEND
    const res = await fetch('https://meet-bot-docker.onrender.com', { method: 'POST' });
    const data = await res.json();
    setSummary(data.summary);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("ChiSquareX Intelligence Summary", 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated automatically on ${new Date().toLocaleDateString()}`, 20, 28);
    
    let cleanText = summary.replace(/\*\*/g, '').replace(/#/g, '');
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(cleanText, 170);
    
    let cursorY = 40;
    for (let i = 0; i < lines.length; i++) {
      if (cursorY > 280) { doc.addPage(); cursorY = 20; }
      doc.text(lines[i], 20, cursorY);
      cursorY += 7;
    }
    doc.save("ChiSquareX_Intelligence.pdf");
  };

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        // WIRED TO RENDER BACKEND
        const res = await fetch('https://meet-bot-8crl.onrender.com/api/summary');
        const data = await res.json();
        if (data.summary !== summary) setSummary(data.summary);
      } catch (e) {}
    }, 3000);
    return () => clearInterval(poll);
  }, [summary]);

  return (
    <div className="min-h-screen bg-[#030712] text-white font-sans overflow-hidden relative cursor-none flex items-center justify-center p-6">
      
      {/* --- CRAZY CUSTOM CURSOR --- */}
      <div 
        className="pointer-events-none fixed top-0 left-0 w-8 h-8 rounded-full border border-cyan-400 z-[100] transition-transform duration-75 ease-out flex items-center justify-center mix-blend-screen shadow-[0_0_15px_rgba(34,211,238,0.5)]"
        style={{ transform: `translate(${mousePos.x - 16}px, ${mousePos.y - 16}px)` }}
      >
        <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping" />
      </div>

      {/* --- AURORA BACKGROUND BLOBS --- */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-cyan-600/20 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-purple-700/20 blur-[150px] rounded-full mix-blend-screen animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

      {/* --- MAIN GLASSMORPHISM CARD --- */}
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
              ChiSquareX Deployment
            </p>
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all hover:scale-105"
          >
            <Settings className="w-6 h-6 text-slate-300" />
          </button>
        </div>

        {/* Dynamic Settings Panel (Toggles visibility) */}
        {showSettings && (
          <div className="bg-black/20 p-6 rounded-2xl border border-white/5 flex gap-6 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Output Format</label>
              <div className="flex gap-2 bg-white/5 p-1 rounded-lg">
                <button onClick={() => setDepth('bullet')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${depth === 'bullet' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'}`}>Bullets</button>
                <button onClick={() => setDepth('para')} className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${depth === 'para' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'}`}>Paragraph</button>
              </div>
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">AI Engine</label>
              <div className="w-full bg-white/5 py-2 px-4 rounded-lg text-sm text-cyan-400 font-mono border border-cyan-500/30 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Gemini 2.5 Flash
              </div>
            </div>
          </div>
        )}

        {/* Input & Controls */}
        <div className="flex gap-4 items-center">
          <div className="flex-1 relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Mic className="h-5 w-5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
            </div>
            <input 
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 pl-12 pr-6 text-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-cyan-500/50 outline-none transition-all shadow-inner"
              placeholder="Paste Google Meet URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {!isRunning ? (
            <button 
              onClick={startBot} 
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-8 py-5 rounded-2xl font-bold text-lg transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center gap-2"
            >
              Initialize <Zap className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={stopBot} 
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 px-8 py-5 rounded-2xl font-bold text-lg transition-all transform animate-pulse shadow-[0_0_20px_rgba(244,63,94,0.4)] flex items-center gap-2"
            >
              Terminate & Compile <SquareTerminal className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Terminal Output Section */}
        <div className="relative mt-4">
          <div className="flex justify-between items-end mb-4 px-2">
            <h2 className="text-sm font-mono text-cyan-400 tracking-widest uppercase flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Live Transcription Buffer
            </h2>
            
            {summary.length > 50 && !summary.includes("Awaiting") && (
              <button 
                onClick={downloadPDF}
                className="group flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:border-purple-500/50"
              >
                <Download className="w-4 h-4 text-purple-400 group-hover:-translate-y-1 transition-transform" />
                Export Intelligence
              </button>
            )}
          </div>
          
          <div className="bg-black/40 p-8 rounded-3xl border border-white/5 shadow-inner min-h-[250px] max-h-[400px] overflow-y-auto custom-scrollbar">
            <div className="text-slate-300 leading-relaxed prose prose-invert prose-p:text-slate-300 prose-headings:text-white prose-strong:text-cyan-300">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </div>
        </div>

      </div>

      {/* Custom Scrollbar CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(34,211,238,0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(34,211,238,0.6); }
      `}} />
    </div>
  );
}

export default App;