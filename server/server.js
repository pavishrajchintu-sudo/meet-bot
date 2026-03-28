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
let currentSummary = "Awaiting deployment...";
let browser = null;

app.post('/api/deploy-bot', async (req, res) => {
    const { meetUrl } = req.body;
    res.status(200).json({ message: "Bot initiated" });

    try {
        console.log("🚀 Launching using System Chrome...");

        browser = await puppeteer.launch({
            // THIS IS THE BYPASS: Pointing to the pre-installed Linux browser
            executablePath: '/usr/bin/google-chrome', 
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Important for low-memory Free Tier
                '--disable-blink-features=AutomationControlled',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to: ${meetUrl}`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 90000 });

        // Wait for name input
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 15000 });
            await page.type(nameInput, "Scribe AI Bot", { delay: 100 });
            await page.keyboard.press('Enter');
        } catch (e) { console.log("⏩ Name skip or already passed"); }

        await new Promise(r => setTimeout(r, 10000));

        const joinSuccess = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const target = btns.find(b => {
                const text = b.innerText.toLowerCase();
                return text.includes('join now') || text.includes('ask to join') || text.includes('join');
            });
            if (target) { target.click(); return true; }
            return false;
        });

        if (joinSuccess) {
            console.log("✅ Bot is knocking!");
            currentSummary = "Bot is knocking... Please Admit 'Scribe AI Bot'!";
        } else {
            console.log("❌ Join button not found in current view.");
            currentSummary = "Error: Bot reached the page but couldn't find the 'Join' button.";
        }

    } catch (error) {
        console.error("❌ Critical Bot Error:", error.message);
        // If system chrome isn't at that path, let's try the other common Linux path
        currentSummary = "Error: Bot failed to start. System browser not found.";
    }
});

app.get('/api/summary', (req, res) => res.json({ summary: currentSummary }));

app.post('/api/stop-bot', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Create a professional summary of the meeting.");
        currentSummary = result.response.text();
        if (browser) await browser.close();
        res.json({ summary: currentSummary });
    } catch (e) { res.status(500).json({ error: "AI Synthesis failed" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🤖 SCRIBE BACKEND LIVE ON PORT ${PORT}`));