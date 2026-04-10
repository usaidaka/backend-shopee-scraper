const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { scrapeShopee, REASON } = require('./scraper');
const { warmSession } = require('./warmer');
const browserManager = require('./browserManager');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

app.get('/api/search', async (req, res) => {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Query parameter "q" is required.' });
    }

    const keyword = q.toLowerCase().trim();

    try {
        // ─── Step 1: Check for a FRESH cache (within 1 hour) ─────────────────
        const freshCache = await pool.query(
            "SELECT * FROM search_caches WHERE keyword = $1 AND created_at >= NOW() - INTERVAL '1 hour'",
            [keyword]
        );

        if (freshCache.rows.length > 0) {
            console.log(`[Cache] Fresh hit for: "${keyword}"`);
            return res.json({
                cached: true,
                stale: false,
                keyword,
                items: freshCache.rows[0].items
            });
        }

        // ─── Step 2: Preload STALE cache before attempting scrape ─────────────
        const staleCache = await pool.query(
            'SELECT * FROM search_caches WHERE keyword = $1',
            [keyword]
        );
        const staleItems = staleCache.rows.length > 0 ? staleCache.rows[0].items : null;

        console.log(`[API] Cache miss/expired for: "${keyword}". Starting scrape.`);

        // ─── Step 3: Attempt live scrape ─────────────────────────────────────
        const { items: scrapedItems, reason } = await scrapeShopee(keyword);

        // ─── Step 4: Scrape success → save fresh cache & return ──────────────
        if (scrapedItems && scrapedItems.length > 0) {
            await pool.query(
                `INSERT INTO search_caches (keyword, items, created_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (keyword) DO UPDATE 
                 SET items = EXCLUDED.items, created_at = NOW();`,
                [keyword, JSON.stringify(scrapedItems)]
            );

            console.log(`[API] Scraped ${scrapedItems.length} items for "${keyword}". Cache updated.`);
            return res.json({
                cached: false,
                stale: false,
                keyword,
                items: scrapedItems
            });
        }

        // ─── Step 5: Scrape returned nothing — check why ──────────────────────

        // Product genuinely doesn't exist on Shopee — don't fallback to stale data
        if (reason === REASON.EMPTY) {
            return res.status(404).json({
                reason: 'EMPTY_RESULTS',
                error: `Tidak ada produk yang ditemukan untuk kata kunci "${keyword}" di Shopee.`
            });
        }

        // Anti-bot triggered → try stale cache fallback
        if (reason === REASON.ANTIBOT || reason === REASON.ERROR) {
            if (staleItems && staleItems.length > 0) {
                console.warn(`[Cache] Anti-bot triggered. Serving stale cache for: "${keyword}"`);
                return res.json({
                    cached: true,
                    stale: true,
                    reason: 'ANTIBOT',
                    keyword,
                    items: staleItems
                });
            }

            // Anti-bot AND no cache at all
            return res.status(503).json({
                reason: 'ANTIBOT',
                error: `Shopee mendeteksi aktivitas scraping dan memblokir request. Hubungi sistem untuk refresh token.`
            });
        }

        // Catch-all
        return res.status(500).json({ error: 'Terjadi kesalahan yang tidak diketahui.' });

    } catch (error) {
        console.error('[API] Unexpected error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Login Flow Endpoints ──────────────────────────────────────────────────
let loginProcess = null;

app.post('/api/login/start', async (req, res) => {
    if (loginProcess) {
        return res.json({ status: 'running' });
    }

    console.log('[API] Starting manual login process...');
    
    // Harus menutup browser background dulu agar profile tidak bentrok denga headless
    try {
        console.log('[API] Pausing background browser to release profile lock...');
        await browserManager.close();
    } catch (e) {
        console.error('[API] Error closing background browser:', e.message);
    }

    loginProcess = spawn(process.execPath, ['setup-session.js'], {
        cwd: __dirname,
        stdio: 'inherit' // Allows the terminal output to show in the backend logs
    });

    loginProcess.on('error', (err) => {
        console.error(`[API] Failed to start login process: ${err.message}`);
        loginProcess = null;
    });

    loginProcess.on('close', (code) => {
        console.log(`[API] Login process exited with code ${code}`);
        loginProcess = null;
    });

    res.json({ status: 'started' });
});

app.get('/api/login/status', (req, res) => {
    if (loginProcess) {
        return res.json({ status: 'running' });
    }

    const userDataDir = path.join(__dirname, 'chrome-data');
    if (fs.existsSync(userDataDir)) {
        return res.json({ status: 'completed' });
    }

    res.json({ status: 'not_started' });
});

// Initial Warming and Periodic Refresh
function initSession() {
    console.log('[Init] Starting background session warming...');
    
    // Run warming without awaiting to let the server respond to requests immediately
    warmSession().catch(e => {
        console.error('[Init] Failed initial warmSession:', e.message);
    });
    
    // Refresh every 15 minutes
    setInterval(async () => {
        console.log('[Auto-Refresh] Refreshing session tokens...');
        try {
            await warmSession();
        } catch (e) {
            console.error('[Auto-Refresh] Failed:', e.message);
        }
    }, 15 * 60 * 1000);
}

app.listen(port, () => {
    console.log(`Backend server listening at http://localhost:${port}`);
    
    // Small delay before starting warming to ensure everything is up
    setTimeout(() => {
        const userDataDir = path.join(__dirname, 'chrome-data');
        if (fs.existsSync(userDataDir)) {
            initSession();
        } else {
            console.log('[Init] chrome-data profile not found. Skipping auto-warming until session is set up.');
        }
    }, 1000);
});
