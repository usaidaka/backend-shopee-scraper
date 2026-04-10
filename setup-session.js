const { Camoufox } = require('camoufox-js');
const path = require('path');
const { simulateHumanMouse, simulateHumanScroll, humanDelay } = require('./browserUtils');
require('dotenv').config();

const USER_DATA_DIR = path.join(__dirname, 'chrome-data');

/**
 * Script ini digunakan untuk login manual ke Shopee dengan Persistent Profile.
 * Hal ini membuat browser memiliki "identitas" asli (cache, localstorage, dll).
 */
async function setupSession() {
    console.log('--- Shopee Deep Stealth Login Setup ---');
    console.log('Membuka browser dengan profil persisten...');
    
    let context;
    try {
        // Camoufox mendukung launchPersistentContext secara langsung
        context = await Camoufox({
            headless: false,
            user_data_dir: USER_DATA_DIR, // Menggunakan folder permanen
        });

        const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
        
        // Buka halaman login
        console.log('Membuka halaman login...');
        await page.goto('https://shopee.co.id/buyer/login', { waitUntil: 'networkidle', timeout: 90000 });

        console.log('\n[PENTING] LANGKAH-LANGKAH:');
        console.log('1. Silakan Login seperti biasa.');
        console.log('2. Selesaikan Captcha jika muncul.');
        console.log('3. JANGAN TUTUP BROWSER setelah login.');
        console.log('4. Tunggu instruksi "✓ Stabilisasi Selesai" di terminal ini.\n');

        // Tunggu sampai login sukses
        const maxWait = 10 * 60 * 1000;
        const startTime = Date.now();
        let loggedIn = false;

        while (Date.now() - startTime < maxWait) {
            const cookies = await context.cookies();
            const hasLoginCookie = cookies.some(c => c.name === 'SPC_U' && c.value !== '');
            const url = page.url();

            if (hasLoginCookie && (url === 'https://shopee.co.id/' || url.includes('shopee.co.id/?'))) {
                loggedIn = true;
                break;
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        if (loggedIn) {
            console.log('✓ Login berhasil!');
            console.log('Menjalankan fase stabilisasi (Simulasi aktivitas manusia)...');
            
            // Lakukan simulasi aktivitas selama 15-20 detik agar Shopee percaya
            for (let i = 0; i < 3; i++) {
                await simulateHumanMouse(page);
                await simulateHumanScroll(page);
                await humanDelay(3000, 5000);
            }

            console.log('✓ Stabilisasi Selesai. Menutup browser...');
        } else {
            console.log('\n[TIMEOUT] Login tidak terdeteksi. Silakan coba lagi.');
        }

    } catch (err) {
        console.error('Terjadi kesalahan:', err.message);
    } finally {
        if (context) {
            await context.close().catch(() => {});
            console.log('Browser/Profile ditutup.');
        }
    }
}

setupSession();
