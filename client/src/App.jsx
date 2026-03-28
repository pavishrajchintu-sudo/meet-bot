import React, { useState } from 'react';
import './App.css'; 

function App() {
  const [url, setUrl] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState('Intelligence Node Active. Awaiting deployment...');

  // Your live AWS Serverless Endpoint
  const AWS_URL = "https://ofunwseaxkbz3koxygqfg3ve6y0skfxi.lambda-url.ap-south-1.on.aws/";

  const startBot = async () => {
    if (!url.includes('meet.google.com')) {
      alert("Please enter a valid Google Meet URL");
      return;
    }
    
    setIsRunning(true);
    setSummary("Initializing AWS Serverless Engine... 🚀");
    
    try {
      const response = await fetch(AWS_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ meetUrl: url }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setSummary(data.message || "Bot is knocking! Admit 'Scribe AI Bot' now.");
      } else {
        setSummary(data.error || "Execution Error: Check AWS CloudWatch Logs.");
        setIsRunning(false);
      }

    } catch (error) {
      console.error("Connection Error:", error);
      setSummary("Network Error: Could not reach the AWS backend.");
      setIsRunning(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>🤖 Scribe.AI</h1>
        <p className="status-text">✨ {summary}</p>
      </header>

      <main className="main-content">
        <div className="input-group">
          <input 
            type="text" 
            placeholder="meet.google.com/abc-defg-hij" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isRunning}
            className="meet-input"
          />
          <button 
            onClick={startBot} 
            disabled={isRunning || !url}
            className={`deploy-btn ${isRunning ? 'running' : ''}`}
          >
            {isRunning ? 'Deploying...' : 'Deploy Bot'}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;