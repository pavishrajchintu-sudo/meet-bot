import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

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
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to: ${meetUrl}`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // STEP 1: Handle Name Input
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 8000 });
            await page.type(nameInput, "Scribe AI Bot");
            await page.keyboard.press('Enter');
        } catch (e) {
            console.log("⏩ No name input detected, proceeding...");
        }

        // STEP 2: Join Logic
        await new Promise(r => setTimeout(r, 5000)); 

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
            console.log("✅ Clicked Join Button.");
            currentSummary = "Bot knocking. Admit 'Scribe AI Bot' now!";
        } else {
            console.log("⚠️ Join button not found.");
        }

    } catch (error) {
        console.error("❌ Bot Error:", error);
        currentSummary = "Error: Bot failed to join.";
    }
});

app.get('/api/summary', (req, res) => {
    res.json({ summary: currentSummary });
});

app.post('/api/stop-bot', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Summarize the project sync-up.");
        currentSummary = result.response.text();
        if (browser) await browser.close();
        res.json({ summary: currentSummary });
    } catch (e) {
        res.status(500).json({ error: "AI Synthesis failed" });
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🤖 SCRIBE BACKEND LIVE ON PORT ${PORT}`);
});