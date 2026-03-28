import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors(), express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
let transcriptBuffer = ""; 
let latestSummary = "System Ready...";
let activeBrowser = null;

app.get('/api/summary', (req, res) => res.json({ summary: latestSummary }));

app.post('/api/deploy-bot', async (req, res) => {
    const { meetUrl } = req.body;
    transcriptBuffer = ""; 
    latestSummary = "Deep Crawler is scanning the meeting...";
    res.status(202).json({ status: "Bot Deployed" });
    runDeepCrawler(meetUrl);
});

app.post('/api/stop-bot', async (req, res) => {
    console.log(">>> FINAL BUFFER CHECK. LENGTH:", transcriptBuffer.length);
    
    if (transcriptBuffer.length > 30) {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = "Summarize this meeting transcript: " + transcriptBuffer;
            const result = await model.generateContent(prompt);
            latestSummary = result.response.text();
        } catch (e) { latestSummary = "AI Error: " + e.message; }
    } else {
        latestSummary = "ERROR: Scraper failed to find text. Ensure 'CC' is BLUE in the bot window.";
    }

    if (activeBrowser) await activeBrowser.close();
    res.json({ status: "Done", summary: latestSummary });
});

async function runDeepCrawler(url) {
    activeBrowser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: ['--use-fake-ui-for-media-stream', `--user-data-dir=${path.join(__dirname, 'bot-session')}`, '--start-maximized']
    });

    const [page] = await activeBrowser.pages();
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 1. Join
    try {
        const joinX = '::-p-xpath(//span[contains(text(), "Join") or contains(text(), "Ask")])';
        await page.waitForSelector(joinX, { timeout: 10000 });
        await page.click(joinX);
    } catch (e) {}

    // 2. Enable Captions (Wait for room to fully load)
    await new Promise(r => setTimeout(r, 12000));
    await page.keyboard.press('c');
    console.log(">>> [LOG]: Shortcut 'c' pressed. CHECK BOT WINDOW NOW.");

    // 3. THE DEEP CRAWLER (Tree Walker)
    const crawlerInterval = setInterval(async () => {
        try {
            const newText = await page.evaluate(() => {
                // We crawl ALL divs/spans that contain more than 15 characters (usually a sentence)
                const elements = document.querySelectorAll('div, span');
                const ignored = ['Mute', 'Camera', 'Leave', 'Meeting details', 'Present', 'Raise hand'];
                
                let combined = "";
                elements.forEach(el => {
                    const txt = el.innerText;
                    // Filter: Must be long, shouldn't be a button label, must be visible
                    if (txt && txt.length > 20 && !ignored.some(word => txt.includes(word))) {
                        // Check if it's in the lower half of the screen (where captions live)
                        const rect = el.getBoundingClientRect();
                        if (rect.top > window.innerHeight * 0.6) {
                            combined += txt + " ";
                        }
                    }
                });
                return combined;
            });

            if (newText && !transcriptBuffer.includes(newText.substring(0, 25))) {
                transcriptBuffer += newText + " ";
                console.log("[CRAWLED]: " + newText.substring(0, 60) + "...");
            }
        } catch (err) {}
    }, 4000);

    setTimeout(() => clearInterval(crawlerInterval), 900000);
}

const PORT = 4000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 DEEP CRAWLER ON PORT ${PORT}`));