const browserManager = require('./browserManager');
const { warmSession } = require('./warmer');
const TokenStore = require('./tokenStore');
const { simulateHumanMouse, simulateHumanScroll, humanDelay } = require('./browserUtils');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const USER_DATA_DIR = path.join(__dirname, 'chrome-data');

// Error reason constants
const REASON = {
    SUCCESS: 'SUCCESS',
    ANTIBOT: 'ANTIBOT',
    EMPTY: 'EMPTY_RESULTS',
    ERROR: 'SCRAPE_ERROR',
};

/**
 * METHOD 2: Camoufox Browser with Human Simulation (Shared Context)
 */
async function scrapeViaCamoufox(keyword) {
    console.log(`[Camoufox] Starting deep stealth scrape for: "${keyword}"`);
    let context;
    let page;
    try {
        // Gunakan shared context
        context = await browserManager.getContext({ headless: true });
        page = await context.newPage();

        let capturedItems = null;
        let capturedReason = null;

        page.on('response', async (response) => {
            const url = response.url();
            if (url.includes('/api/v4/search/search_items')) {
                const status = response.status();
                if (status === 200) {
                    try {
                        const json = await response.json();
                        if (json.error === 0) {
                            const items = json?.items || [];
                            if (items.length > 0) {
                                capturedItems = items.map(item => {
                                    const info = item.item_basic || item;
                                    const rawPrice = Math.min(info.price || Infinity, info.price_min || Infinity);
                                    const price = Math.round(rawPrice / 100000);
                                    return {
                                        name: info.name || '',
                                        price,
                                        priceStr: `Rp${price.toLocaleString('id-ID')}`,
                                        link: `https://shopee.co.id/product/${info.shopid}/${info.itemid}`
                                    };
                                }).filter(p => p.name && p.price > 0).sort((a, b) => a.price - b.price).slice(0, 3);
                                capturedReason = REASON.SUCCESS;
                            } else {
                                capturedReason = REASON.EMPTY;
                            }
                        } else {
                            capturedReason = REASON.ANTIBOT;
                        }
                    } catch (e) {}
                } else if (status === 403 || status === 429) {
                    capturedReason = REASON.ANTIBOT;
                }
            }
        });

        const url = `https://shopee.co.id/search?keyword=${encodeURIComponent(keyword)}`;
        console.log(`[Camoufox] Navigating to search: ${url}`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await simulateHumanMouse(page);
        await simulateHumanScroll(page);
        await humanDelay(2000, 4000);

        const waitForCapture = new Promise((resolve) => {
            const check = setInterval(async () => {
                if (capturedItems !== null || capturedReason === REASON.EMPTY) {
                    clearInterval(check);
                    resolve();
                    return;
                }
                const hasItems = await page.$('li.col-xs-2-4, div[data-sqe="item"]').catch(() => null);
                if (hasItems) {
                    clearInterval(check);
                    resolve();
                }
            }, 1000);
            setTimeout(() => { clearInterval(check); resolve(); }, 30000);
        });

        await waitForCapture;

        if (capturedItems && capturedItems.length > 0) {
            return { items: capturedItems, reason: REASON.SUCCESS };
        }

        console.log('[Camoufox] API intercept failed, trying DOM extraction...');
        const products = await page.evaluate(() => {
            // Gunakan selektor href yang sangat konsisten di Shopee (berakhiran -i.shopid.itemid)
            const cards = Array.from(document.querySelectorAll('a[data-sqe="link"], a[href*="-i."]'));
            const items = [];
            
            for (const el of cards) {
                // Ambil semua teks dari div di dalam card ini
                const candidateDivs = Array.from(el.querySelectorAll('div, span'));
                let name = '';
                
                // Cari innerText yang cukup panjang yang tidak mengandung kata-kata harga/terjual (biasanya itu nama judul)
                for (const node of candidateDivs) {
                    const text = node.innerText?.trim() || '';
                    if (text.length > 15 && !text.includes('Rp') && !text.toLowerCase().includes('terjual') && !text.includes('KAB.')) {
                        name = text.split('\n')[0]; // Ambil baris pertama menghindari gabungan teks
                        break;
                    }
                }
                
                // Fallback kedua: baca atribut alt pada gambar produk
                if (!name) {
                    const img = el.querySelector('img');
                    if (img && img.alt && img.alt.length > 10) {
                        name = img.alt;
                    }
                }

                const priceMatch = el.innerText.match(/Rp\s*([\d.]+)/);
                const priceStr = priceMatch ? priceMatch[0] : '';
                const priceNum = priceStr ? parseInt(priceStr.replace(/[^\d]/g, '')) : 0;
                
                if (name && priceNum > 0) {
                    items.push({ name, price: priceNum, priceStr, link: el.href || '' });
                }
                
                if (items.length >= 3) break;
            }
            return items;
        }).catch((e) => {
            console.error('DOM Evaluation error:', e);
            return [];
        });

        if (products.length > 0) {
            return { items: products, reason: REASON.SUCCESS };
        }

        const isBlocked = await page.evaluate(() => {
            const t = document.body?.innerText?.toLowerCase() || '';
            return t.includes('captcha') || t.includes('security check') || t.includes('robot') || t.includes('verify');
        }).catch(() => false);

        return { items: [], reason: isBlocked ? REASON.ANTIBOT : (capturedReason || REASON.EMPTY) };

    } catch (err) {
        console.error('[Camoufox] Error:', err.message);
        return { items: [], reason: REASON.ERROR };
    } finally {
        if (page) await page.close().catch(() => {});
        console.log('[Camoufox] Scraper page closed.');
    }
}

/**
 * MAIN: Automated Deep Stealth Scraper
 */
async function scrapeShopee(keyword) {
    if (!fs.existsSync(USER_DATA_DIR)) {
        console.log('[Scraper] Workspace profile not found. Warming required.');
        await warmSession();
    }

    return scrapeViaCamoufox(keyword);
}

module.exports = { scrapeShopee, REASON };
