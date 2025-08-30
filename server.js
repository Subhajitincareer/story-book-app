// server.js
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiter
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 25,
    message: { error: 'Too many requests. Please try again later.' }
});

app.use('/story', limiter);

// Cache
const cache = new NodeCache({ stdTTL: 1800 });

// API key
const DEFAULT_GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Health check route
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: NODE_ENV
    });
});

// Story route
app.get('/story', async (req, res) => {
    const { word, apiKey, wordCount } = req.query;

    if (!word) return res.status(400).json({ error: "Word is required!" });

    const GEMINI_API_KEY = apiKey || DEFAULT_GEMINI_API_KEY;
    const maxWords = wordCount || '200';

    let maxTokens;
    switch (maxWords) {
        case '200': maxTokens = 350; break;
        case '500': maxTokens = 750; break;
        case '1000': maxTokens = 1500; break;
        default: maxTokens = 350;
    }

    // Cache key
    const cacheKey = `story:${word.toLowerCase()}:${maxWords}`;

    // Check cache
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        return res.json({ ...cachedResult, cached: true });
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                contents: [
                    {
                        parts: [{
                            text: `তুমি ছোটদের জন্য বাংলা মজার গল্প লেখো। "${word}" নিয়ে একটা ছোট্ট মজার গল্প ও শিক্ষণীয় বার্তা লেখো, ঠিক ${maxWords} শব্দের মধ্যে।`
                        }]
                    }
                ],
                generationConfig: {
                    maxOutputTokens: maxTokens,
                    temperature: 0.8
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            }
        );

        const responseData = {
            ...response.data,
            usedApiKey: apiKey ? 'user' : 'default',
            wordCount: maxWords,
            cached: false
        };

        // Cache the response
        cache.set(cacheKey, responseData);

        res.json(responseData);

    } catch (err) {
        console.error('API Error:', err.response?.data || err.message);

        res.status(500).json({
            error: "Story generation failed",
            details: err.response?.data?.error?.message || err.message,
            usedApiKey: apiKey ? 'user' : 'default'
        });
    }
});

// Error handlers
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

const server = app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 Environment: ${NODE_ENV}`);
});

export default app;
