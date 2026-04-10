const { scrapeShopee } = require('./scraper');

async function test() {
    console.log('--- Testing Automated Scraper ---');
    const result = await scrapeShopee('laptop');
    console.log('Result Reason:', result.reason);
    console.log('Items Found:', result.items.length);
    if (result.items.length > 0) {
        console.log('Top Item:', result.items[0].name, '-', result.items[0].priceStr);
    }
}

test();
