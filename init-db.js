const { Client } = require('pg');
require('dotenv').config();

async function initDB() {
    // 1. Connect to default postgres DB to create shopee_scraper
    const defaultClient = new Client({
        connectionString: process.env.DATABASE_URL.replace('/shopee_scraper', '/postgres')
    });
    
    try {
        await defaultClient.connect();
        const res = await defaultClient.query("SELECT datname FROM pg_catalog.pg_database WHERE datname = 'shopee_scraper'");
        
        if (res.rowCount === 0) {
            console.log('Database not found. Creating shopee_scraper...');
            await defaultClient.query('CREATE DATABASE shopee_scraper');
            console.log('Database shopee_scraper created.');
        } else {
            console.log('Database shopee_scraper already exists.');
        }
    } catch (error) {
        console.error('Error connecting or creating database:', error);
    } finally {
        await defaultClient.end();
    }

    // 2. Connect to shopee_scraper to create table
    const targetClient = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await targetClient.connect();
        
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS search_caches (
                keyword VARCHAR(255) PRIMARY KEY,
                items JSONB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        await targetClient.query(createTableQuery);
        console.log('Table search_caches is ready.');
    } catch (error) {
        console.error('Error creating table:', error);
    } finally {
        await targetClient.end();
    }
}

initDB();
