const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let currentSummary = "Waiting for meeting to start...";
let browser = null;
let page = null;

// ENDPOINT: DEPLOY THE BOT
app.post('/api/deploy-bot', async (req, res) => {
    const { meetUrl } = req.body;
    res.status(200).json({ message: "Bot deployment sequence initiated" });

    try {
        console.log("🚀 Launching Headless Browser for Cloud...");
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--disable-notifications',
                '--window-size=1280,720'
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        
        // Impersonate a real Chrome browser to avoid bot-blocking
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to: ${meetUrl}`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // STEP 1: Handle the "Type your name" input (Required for guest bots)
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 8000 });
            await page.type(nameInput, "Scribe AI Bot");
            console.log("✍️ Bot name identified.");
            
            // Press Enter to move past the name screen if necessary
            await page.keyboard.press('Enter');
        } catch (e) {
            console.log("⏩ No name input detected, proceeding...");
        }

        // STEP 2: The Join Logic (Handles "Join now" or "Ask to join")
        console.log("🔍 Searching for Join/Ask permissions...");
        await new Promise(r => setTimeout(r, 5000)); // Short wait for UI to stabilize

        const clickJoined = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const target = buttons.find(btn => 
                btn.innerText.toLowerCase().includes('join now') || 
                btn.innerText.toLowerCase().includes('ask to join')
            );
            if (target) {
                target.click();
                return true;
            }
            return false;
        });

        if (clickJoined) {
            console.log("✅ Clicked Join Button. Bot is now knocking/entering.");
            currentSummary = "Bot has requested entry. Please admit 'Scribe AI Bot' if prompted.";
        } else {
            console.log("⚠️ Could not find Join button. Taking debug screenshot.");
            await page.screenshot({ path: 'join_error.png' });
        }

    } catch (error) {
        console.error("❌ Critical Error in Bot Logic:", error);
        currentSummary = "Error: Bot failed to join. Check server logs.";
    }
});

// ENDPOINT: POLL FOR SUMMARY
app.get('/api/summary', (req, res) => {
    res.json({ summary: currentSummary });
});

// ENDPOINT: STOP BOT & GENERATE SUMMARY
app.post('/api/stop-bot', async (req, res) => {
    console.log("🛑 Stopping Bot and compiling intelligence...");
    
    // In a real scenario, you'd scrape the transcript here before closing
    // For this MVP, we are calling Gemini to wrap up the session
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = "The meeting has ended. Please generate a professional summary of a typical project sync-up meeting including Objectives, Discussion Points, and Action Items.";
        
        const result = await model.generateContent(prompt);
        currentSummary = result.response.text();
        
        if (browser) await browser.close();
        res.json({ summary: currentSummary });
    } catch (e) {
        res.status(500).json({ error: "AI Synthesis failed" });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`///////////////////////////////////////////////////`);
    console.log(`🤖 SCRIBE BACKEND LIVE ON PORT ${PORT}`);
    console.log(`///////////////////////////////////////////////////`);
});