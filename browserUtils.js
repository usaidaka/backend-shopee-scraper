/**
 * Utility functions to simulate human behavior in the browser.
 */

/**
 * Simulates human-like scrolling.
 * @param {import('playwright').Page} page 
 */
async function simulateHumanScroll(page) {
    console.log('[HumanSim] Simulating human scroll...');
    const scrolls = Math.floor(Math.random() * 3) + 2; // 2-5 scrolls
    for (let i = 0; i < scrolls; i++) {
        const amount = Math.floor(Math.random() * 400) + 200;
        await page.mouse.wheel(0, amount);
        await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));
    }
    // Scroll back up a bit
    await page.mouse.wheel(0, -200);
}

/**
 * Simulates random mouse movements.
 * @param {import('playwright').Page} page 
 */
async function simulateHumanMouse(page) {
    console.log('[HumanSim] Simulating random mouse movements...');
    const moves = Math.floor(Math.random() * 5) + 3;
    for (let i = 0; i < moves; i++) {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 800);
        await page.mouse.move(x, y, { steps: 10 });
        await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
    }
}

/**
 * Advanced wait to look natural.
 */
async function humanDelay(min = 1000, max = 3000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(r => setTimeout(r, delay));
}

module.exports = {
    simulateHumanScroll,
    simulateHumanMouse,
    humanDelay
};
