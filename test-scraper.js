
const { scrapeShopee, REASON } = require('./scraper');

async function test() {
    console.log('Testing Shopee scraper...');
    const result = await scrapeShopee('laptop');
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(0);
}

test();
