const browserManager = require('./browserManager');
const TokenStore = require('./tokenStore');
const { simulateHumanMouse, simulateHumanScroll, humanDelay } = require('./browserUtils');
const { URL } = require('url');
require('dotenv').config();

function getProxyConfig() {
    const proxyStr = process.env.SHOPEE_PROXY;
    if (!proxyStr) return undefined;
    
    try {
        const proxyUrl = new URL(proxyStr);
        return {
            server: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
            username: proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined,
            password: proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined
        };
    } catch (e) {
        console.warn(`[Proxy] Format SHOPEE_PROXY tidak valid: ${e.message}`);
        return undefined;
    }
}

/**
 * Automates the process of visiting Shopee and "harvesting" fresh security tokens.
 * Using Persistent Profile via BrowserManager.
 */
async function warmSession() {
    console.log('[Warmer] Starting session warming...');
    let context;
    let page;
    try {
        const browserOptions = { headless: false };
        const proxyConfig = getProxyConfig();
        if (proxyConfig) {
            console.log(`[Proxy-Warmer] Menghubungkan via proxy: ${proxyConfig.server}`);
            browserOptions.proxy = proxyConfig;
        }

        // Gunakan shared context dari manager
        context = await browserManager.getContext(browserOptions);

        // Buat page baru dalam context yang sama
        page = await context.newPage();
        
        let captured = {
            cookie: '',
            'af-ac-enc-dat': '',
            'x-csrftoken': ''
        };

        const requestHandler = (request) => {
            const url = request.url();
            const headers = request.headers();
            if (url.includes('/api/v4/search/search_items') && headers['af-ac-enc-dat']) {
                captured['af-ac-enc-dat'] = headers['af-ac-enc-dat'];
                captured['x-csrftoken'] = headers['x-csrftoken'] || headers['x-csrf-token'];
            }
        };

        page.on('request', requestHandler);

        console.log('[Warmer] Navigating to Shopee...');
        await page.goto('https://shopee.co.id/', { waitUntil: 'networkidle', timeout: 60000 });
        
        await simulateHumanMouse(page);
        await simulateHumanScroll(page);
        await humanDelay(1000, 2000);

        const dummyKeywords = ['baju', 'sepatu', 'tas', 'kaos'];
        const keyword = dummyKeywords[Math.floor(Math.random() * dummyKeywords.length)];
        
        console.log(`[Warmer] Triggering internal API via search: ${keyword}`);
        await page.goto(`https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}`, { 
            waitUntil: 'networkidle', 
            timeout: 60000 
        });

        await humanDelay(3000, 5000);

        const cookies = await context.cookies();
        captured.cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');

        if (captured['af-ac-enc-dat']) {
            captured.userAgent = await page.evaluate(() => navigator.userAgent);
            TokenStore.save(captured);
            console.log('[Warmer] Session warmed successfully.');
            return { success: true, data: captured };
        } else {
            console.warn('[Warmer] Could not capture af-ac-enc-dat.');
            return { success: false };
        }

    } catch (err) {
        console.error('[Warmer] Error:', err.message);
        return { success: false, error: err.message };
    } finally {
        // JANGAN tutup context, hanya tutup page nya saja
        if (page) await page.close().catch(() => {});
        console.log('[Warmer] Worker page closed.');
    }
}

if (require.main === module) {
    warmSession();
}

module.exports = { warmSession };
