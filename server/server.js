import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

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
        console.log("🚀 Launching Headless Browser with Fixed Path...");
        
        // This is the secret sauce for Render's Puppeteer cache
        const chromePath = '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome';

        browser = await puppeteer.launch({
            executablePath: chromePath, // MANUALLY POINTING TO CHROME
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
                '--lang=en-US'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to: ${meetUrl}`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // WAIT and JOIN logic
        await new Promise(r => setTimeout(r, 8000));
        
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 10000 });
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
            currentSummary = "Bot is knocking... Click 'Admit' in your Meet!";
        } else {
            console.log("❌ Button not found.");
            currentSummary = "Error: Bot reached the page but couldn't find the join button.";
        }

    } catch (error) {
        console.error("❌ Critical Bot Error:", error.message);
        currentSummary = "Error: Bot failed to join.";
    }
});

app.get('/api/summary', (req, res) => res.json({ summary: currentSummary }));

app.post('/api/stop-bot', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Create a professional summary.");
        currentSummary = result.response.text();
        if (browser) await browser.close();
        res.json({ summary: currentSummary });
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

app.listen(process.env.PORT || 4000);