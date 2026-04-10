const fs = require('fs');
const path = require('path');

const SESSION_FILE = path.join(__dirname, 'session.json');

/**
 * Manages the persistent session tokens for Shopee scraping.
 * This avoids dependency on manual .env updates.
 */
class TokenStore {
    static get() {
        try {
            if (fs.existsSync(SESSION_FILE)) {
                return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            }
        } catch (e) {
            console.error('[TokenStore] Failed to read session file:', e.message);
        }
        return null;
    }

    static save(data) {
        try {
            const current = this.get() || {};
            const updated = {
                ...current,
                ...data,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(SESSION_FILE, JSON.stringify(updated, null, 2));
            console.log('[TokenStore] Session tokens updated successfully.');
            return true;
        } catch (e) {
            console.error('[TokenStore] Failed to save session file:', e.message);
            return false;
        }
    }

    static isValid() {
        const data = this.get();
        if (!data || !data.cookie || !data['af-ac-enc-dat']) return false;
        
        // Check if token is older than 2 hours (Shopee tokens are volatile)
        const updatedAt = new Date(data.updatedAt);
        const now = new Date();
        const diffInMinutes = (now - updatedAt) / 1000 / 60;
        
        return diffInMinutes < 120; // 2 hours threshold
    }
}

module.exports = TokenStore;
