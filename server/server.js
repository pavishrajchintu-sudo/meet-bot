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
let page = null;

app.post('/api/deploy-bot', async (req, res) => {
    const { meetUrl } = req.body;
    res.status(200).json({ message: "Bot deployment sequence initiated" });

    try {
        console.log("🚀 Launching Headless Browser...");
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
        // Increase timeout for cloud navigation
        await page.goto(meetUrl, { waitUntil: 'networkidle2', timeout: 90000 });

        // STEP 1: Handle Name Input (Wait longer for cloud delay)
        try {
            const nameInput = 'input[type="text"]';
            await page.waitForSelector(nameInput, { timeout: 15000 });
            await page.type(nameInput, "Scribe AI Bot", { delay: 100 });
            await page.keyboard.press('Enter');
            console.log("✍️ Bot name entered.");
        } catch (e) {
            console.log("⏩ No name input box found, skipping...");
        }

        // STEP 2: The Brute-Force Smart Joiner
        await new Promise(r => setTimeout(r, 10000)); // Give UI 10 seconds to load buttons

        const joinSuccess = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            // Look for any button that resembles joining
            const joinBtn = buttons.find(btn => {
                const text = btn.innerText.toLowerCase();
                return text.includes('join now') || 
                       text.includes('ask to join') || 
                       text.includes('join') ||
                       btn.getAttribute('aria-label')?.toLowerCase().includes('join');
            });
            
            if (joinBtn) {
                joinBtn.click();
                return true;
            }
            return false;
        });

        if (joinSuccess) {
            console.log("✅ Clicked Join/Ask button.");
            currentSummary = "Bot knocking... Please click 'Admit' in your Google Meet now!";
        } else {
            console.log("❌ Could not find any join button.");
            currentSummary = "Error: Bot couldn't find the 'Join' button. Is the link valid?";
        }

    } catch (error) {
        console.error("❌ Critical Bot Error:", error);
        currentSummary = "Error: Bot failed to join.";
    }
});

app.get('/api/summary', (req, res) => {
    res.json({ summary: currentSummary });
});

app.post('/api/stop-bot', async (req, res) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Create a professional summary of the meeting.");
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