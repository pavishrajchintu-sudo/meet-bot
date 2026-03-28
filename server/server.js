import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
        // Updated to the absolute path structure Render uses
        const executablePath = path.join(__dirname, 'chrome-bin', 'chrome', 'linux-127.0.6533.88', 'chrome-linux64', 'chrome');
        
        console.log(`🚀 Launching from Absolute Path: ${executablePath}`);

        browser = await puppeteer.launch({
            executablePath: executablePath,
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to: ${meetUrl}`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 90000 });

        // Join Logic
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 15000 });
            await page.type(nameInput, "Scribe AI Bot", { delay: 100 });
            await page.keyboard.press('Enter');
        } catch (e) { console.log("⏩ Name skip"); }

        await new Promise(r => setTimeout(r, 10000));

        const joinSuccess = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const target = btns.find(b => b.innerText.toLowerCase().includes('join') || b.innerText.toLowerCase().includes('ask'));
            if (target) { target.click(); return true; }
            return false;
        });

        if (joinSuccess) {
            console.log("✅ Bot is knocking!");
            currentSummary = "Bot is knocking... Please Admit 'Scribe AI Bot'!";
        } else {
            currentSummary = "Error: Join button not found.";
        }

    } catch (error) {
        console.error("❌ Critical Bot Error:", error.message);
        currentSummary = "Error: Bot failed to start. Path issue.";
    }
});

app.get('/api/summary', (req, res) => res.json({ summary: currentSummary }));

app.post('/api/stop-bot', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Summarize the meeting.");
        currentSummary = result.response.text();
        if (browser) await browser.close();
        res.json({ summary: currentSummary });
    } catch (e) { res.status(500).json({ error: "Summary failed" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🤖 Backend Live on Port ${PORT}`));