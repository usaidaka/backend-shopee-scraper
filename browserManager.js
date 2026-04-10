const { Camoufox } = require('camoufox-js');
const path = require('path');
require('dotenv').config();

const USER_DATA_DIR = path.join(__dirname, 'chrome-data');

/**
 * BrowserManager (Singleton)
 * Mengelola satu instance persistent browser context.
 * Mendukung proxy rotation — bisa restart dengan proxy baru.
 */
class BrowserManager {
    constructor() {
        this.context = null;
        this.isLaunching = false;
        this.launchWaiters = [];
        this.currentProxy = null; // Track proxy yang sedang aktif
    }

    /**
     * Mendapatkan context browser. Jika belum ada, akan membuat baru.
     * Jika sedang dalam proses pembuatan, akan menunggu sampai selesai.
     */
    async getContext(options = {}) {
        // Jika ada context, cek apakah browser masih tersambung
        if (this.context) {
            try {
                if (this.context.browser().isConnected()) {
                    return this.context;
                }
                console.log('[BrowserManager] Browser disconnected, clearing stale context...');
                this.context = null;
            } catch (e) {
                this.context = null;
            }
        }

        if (this.isLaunching) {
            return new Promise((resolve, reject) => {
                this.launchWaiters.push({ resolve, reject });
            });
        }

        this.isLaunching = true;
        try {
            const launchOptions = {
                headless: options.headless !== undefined ? options.headless : true,
                user_data_dir: USER_DATA_DIR,
            };

            // Inject proxy jika ada
            if (options.proxy) {
                launchOptions.proxy = options.proxy;
                this.currentProxy = options.proxy;
                console.log(`[BrowserManager] Launching with proxy: ${options.proxy.server}`);
            } else {
                this.currentProxy = null;
                console.log('[BrowserManager] Launching shared persistent context (no proxy)...');
            }

            this.context = await Camoufox(launchOptions);

            // Buka satu page "keep-alive" agar browser tidak tutup otomatis saat page lain ditutup
            await this.context.newPage();

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
     * Restart browser context dengan proxy baru.
     * Menutup context lama, lalu launch ulang dengan proxy yang diberikan.
     * Profile data (cookies dll) tetap persisten di disk.
     */
    async restartWithProxy(proxyConfig) {
        console.log(`[BrowserManager] Restarting with new proxy: ${proxyConfig ? proxyConfig.server : 'direct'}...`);
        await this.close();
        // Beri jeda singkat setelah close
        await new Promise(r => setTimeout(r, 1000));
        return this.getContext({
            headless: false,
            proxy: proxyConfig || undefined,
        });
    }

    /**
     * Menutup browser jika diperlukan.
     */
    async close() {
        if (this.context) {
            console.log('[BrowserManager] Closing shared context...');
            await this.context.close().catch(() => {});
            this.context = null;
            this.currentProxy = null;
        }
    }

    /**
     * Cek apakah sedang menggunakan proxy
     */
    getCurrentProxy() {
        return this.currentProxy;
    }
}

// Export as Singleton
module.exports = new BrowserManager();
