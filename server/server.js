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

// Health Check for Render
app.get('/', (req, res) => res.send("🤖 Scribe AI Docker Server is Live!"));

app.post('/api/deploy-bot', async (req, res) => {
    const { meetUrl } = req.body;
    res.status(200).json({ message: "Bot initiated" });

    try {
        console.log("🚀 Launching Chrome at /usr/bin/google-chrome...");
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome',
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to Meet...`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Enter Name
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 10000 });
            await page.type(nameInput, "Scribe AI Bot", { delay: 100 });
            await page.keyboard.press('Enter');
        } catch (e) { console.log("⏩ Name screen skipped"); }

        await new Promise(r => setTimeout(r, 10000));

        // Click Join
        const clicked = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const target = btns.find(b => {
                const t = b.innerText.toLowerCase();
                return t.includes('join now') || t.includes('ask to join') || t.includes('join');
            });
            if (target) { target.click(); return true; }
            return false;
        });

        currentSummary = clicked ? "Bot is knocking! Admit 'Scribe AI Bot' now." : "Error: Couldn't find join button.";
        console.log(clicked ? "✅ Knocking..." : "❌ Join button missing.");

    } catch (error) {
        console.error("❌ Bot Error:", error.message);
        currentSummary = "Error: Bot failed to start inside container.";
    }
});

app.get('/api/summary', (req, res) => res.json({ summary: currentSummary }));

app.post('/api/stop-bot', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Summarize the meeting highlights.");
        currentSummary = result.response.text();
        if (browser) await browser.close();
        res.json({ summary: currentSummary });
    } catch (e) { res.status(500).json({ error: "Summary generation failed" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🤖 Server running on port ${PORT}`));