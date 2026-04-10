const { Camoufox } = require('camoufox-js');
const path = require('path');
require('dotenv').config();

const USER_DATA_DIR = path.join(__dirname, 'chrome-data');

/**
 * BrowserManager (Singleton)
 * Mengelola satu instance persistent browser kkonteks untuk menghindari error "Firefox is already open".
 */
class BrowserManager {
    constructor() {
        this.context = null;
        this.isLaunching = false;
        this.launchWaiters = [];
    }

    /**
     * Mendapatkan context browser. Jika belum ada, akan membuat baru.
     * Jika sedang dalam proses pembuatan, akan menunggu sampai selesai.
     */
    async getContext(options = {}) {
        if (this.context) return this.context;

        if (this.isLaunching) {
            return new Promise((resolve, reject) => {
                this.launchWaiters.push({ resolve, reject });
            });
        }

        this.isLaunching = true;
        try {
            console.log('[BrowserManager] Launching shared persistent context...');
            this.context = await Camoufox({
                headless: options.headless !== undefined ? options.headless : true,
                user_data_dir: USER_DATA_DIR,
                ...options
            });

            // Beritahu semua yang sedang menunggu
            while (this.launchWaiters.length > 0) {
                const { resolve } = this.launchWaiters.shift();
                resolve(this.context);
            }

            return this.context;
        } catch (err) {
            this.isLaunching = false;
            // Beritahu semua yang menunggu bahwa terjadi error
            while (this.launchWaiters.length > 0) {
                const { reject } = this.launchWaiters.shift();
                reject(err);
            }
            throw err;
        } finally {
            this.isLaunching = false;
        }
    }

    /**
     * Menutup browser jika diperlukan.
     */
    async close() {
        if (this.context) {
            console.log('[BrowserManager] Closing shared context...');
            await this.context.close().catch(() => {});
            this.context = null;
        }
    }
}

// Export as Singleton
module.exports = new BrowserManager();
