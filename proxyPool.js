/**
 * proxyPool.js — Free Proxy Pool Manager
 * 
 * Mengambil daftar proxy gratis dari berbagai sumber publik,
 * melakukan validasi cepat, dan menyediakan rotasi otomatis.
 */

const http = require('http');
const https = require('https');
const net = require('net');
require('dotenv').config();

// Sumber-sumber proxy gratis
const PROXY_SOURCES = [
    // HTTP/HTTPS
    { url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=elite', type: 'http' },
    { url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=yes&anonymity=anonymous', type: 'http' },
    { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt', type: 'http' },
    { url: 'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt', type: 'http' },
    // SOCKS5 (biasanya lebih stabil untuk browsing)
    { url: 'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=all', type: 'socks5' },
    { url: 'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt', type: 'socks5' },
];

class ProxyPool {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
        this.badProxies = new Set();
        this.lastFetchTime = 0;
        this.isFetching = false;
        this.REFRESH_INTERVAL = 20 * 60 * 1000; // 20 menit
    }

    /**
     * Fetch URL dan return body sebagai string (gunakan built-in http/https)
     */
    _fetchUrl(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            const req = client.get(url, { timeout: 15000 }, (res) => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`HTTP ${res.statusCode}`));
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });
    }

    /**
     * Ambil proxy list dari semua sumber
     */
    async fetchProxies() {
        if (this.isFetching) return this.proxies.length;
        this.isFetching = true;

        console.log('[ProxyPool] Fetching free proxy lists...');
        const allProxies = [];

        for (const source of PROXY_SOURCES) {
            try {
                const data = await this._fetchUrl(source.url);
                const lines = data.split('\n')
                    .map(l => l.trim())
                    .filter(l => /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d{2,5}$/.test(l));
                
                for (const line of lines) {
                    allProxies.push({
                        server: `${source.type === 'socks5' ? 'socks5' : 'http'}://${line}`,
                        type: source.type,
                        host: line,
                    });
                }
                console.log(`[ProxyPool]   ${source.type} source: +${lines.length} proxies`);
            } catch (e) {
                console.warn(`[ProxyPool]   Source error: ${e.message}`);
            }
        }

        // Deduplicate, remove known-bad
        const uniqueMap = new Map();
        for (const p of allProxies) {
            if (!this.badProxies.has(p.host)) {
                uniqueMap.set(p.host, p);
            }
        }

        this.proxies = Array.from(uniqueMap.values());

        // Shuffle untuk randomness
        for (let i = this.proxies.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.proxies[i], this.proxies[j]] = [this.proxies[j], this.proxies[i]];
        }

        this.currentIndex = 0;
        this.lastFetchTime = Date.now();
        this.isFetching = false;

        console.log(`[ProxyPool] Total unique proxies ready: ${this.proxies.length}`);
        return this.proxies.length;
    }

    /**
     * Quick TCP connectivity check — apakah proxy bisa connect
     */
    quickTest(proxyHost, timeoutMs = 5000) {
        return new Promise((resolve) => {
            const [ip, port] = proxyHost.split(':');
            const socket = net.createConnection({ host: ip, port: parseInt(port), timeout: timeoutMs });
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('error', () => { socket.destroy(); resolve(false); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
        });
    }

    /**
     * Ambil proxy berikutnya yang lolos quick test
     * Akan mencoba sampai maxAttempts proxy sebelum menyerah
     */
    async getNext(maxAttempts = 10) {
        // Refresh jika kosong atau sudah expire
        if (this.proxies.length === 0 || Date.now() - this.lastFetchTime > this.REFRESH_INTERVAL) {
            await this.fetchProxies();
        }

        if (this.proxies.length === 0) {
            console.warn('[ProxyPool] Tidak ada proxy tersedia!');
            return null;
        }

        // Coba sampai menemukan proxy yang connect
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (this.currentIndex >= this.proxies.length) {
                // Sudah habis 1 putaran — reset
                this.currentIndex = 0;
                if (attempt > 0) break; // Jangan loop terus
            }

            const proxy = this.proxies[this.currentIndex++];

            // Quick TCP test
            const isAlive = await this.quickTest(proxy.host, 4000);
            if (isAlive) {
                console.log(`[ProxyPool] Selected: ${proxy.server} (attempt ${attempt + 1})`);
                return proxy;
            } else {
                this.markBad(proxy);
            }
        }

        console.warn(`[ProxyPool] Tidak menemukan proxy yang aktif setelah ${maxAttempts} percobaan`);
        return null;
    }

    /**
     * Tandai proxy sebagai gagal
     */
    markBad(proxy) {
        if (proxy && proxy.host) {
            this.badProxies.add(proxy.host);
            this.proxies = this.proxies.filter(p => p.host !== proxy.host);
        }
    }

    /**
     * Statistik pool
     */
    getStats() {
        return {
            available: this.proxies.length,
            badCount: this.badProxies.size,
            index: this.currentIndex,
        };
    }
}

// Singleton
module.exports = new ProxyPool();
