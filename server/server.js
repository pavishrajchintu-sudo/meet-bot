import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let currentSummary = "Awaiting deployment...";
let browser = null;

// HELPER: Dynamic Path Finder
const findChromePath = () => {
    try {
        // Try to find where the OS put it
        return execSync('which google-chrome').toString().trim();
    } catch (e) {
        try {
            return execSync('which chromium').toString().trim();
        } catch (e2) {
            // Fallback to the most common Puppeteer Docker image path
            return '/usr/bin/google-chrome';
        }
    }
};

app.get('/', (req, res) => res.send("🤖 Scribe AI Docker Node is Online!"));

app.post('/api/deploy-bot', async (req, res) => {
    const { meetUrl } = req.body;
    res.status(200).json({ message: "Bot initiated" });

    try {
        const chromePath = findChromePath();
        console.log(`🚀 Launching Chrome from: ${chromePath}`);

        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: "new",
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--use-fake-ui-for-media-stream',
                '--use-fake-device-for-media-stream',
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        console.log(`🔗 Navigating to Meet...`);
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 90000 });

        // Wait for name input
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 15000 });
            await page.type(nameInput, "Scribe AI Bot", { delay: 100 });
            await page.keyboard.press('Enter');
            console.log("✍️ Name entered.");
        } catch (e) { console.log("⏩ Proceeding past name screen..."); }

        await new Promise(r => setTimeout(r, 10000));

        const joinSuccess = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const target = btns.find(b => {
                const t = b.innerText.toLowerCase();
                return t.includes('join now') || t.includes('ask to join') || t.includes('join');
            });
            if (target) { target.click(); return true; }
            return false;
        });

        if (joinSuccess) {
            console.log("✅ Bot is knocking!");
            currentSummary = "Bot is knocking... Admit 'Scribe AI Bot' now!";
        } else {
            console.log("❌ Join button not found.");
            currentSummary = "Error: Bot reached the page but couldn't find the 'Join' button.";
        }

    } catch (error) {
        console.error("❌ CRITICAL DOCKER ERROR:", error.message);
        currentSummary = `Error: Bot failed to start. Detail: ${error.message}`;
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
    } catch (e) { res.status(500).json({ error: "Fail" }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🤖 Server listening on 0.0.0.0:${PORT}`));