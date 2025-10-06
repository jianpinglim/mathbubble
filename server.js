import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://mathbubble.onrender.com'] // Replace with your actual domain
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Limit payload size

// Security headers
app.use((req, res, next) => {
    // Prevent XSS attacks
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://polyfill.io",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' https://*.supabase.co"
    ].join('; '));
    
    // HSTS for HTTPS
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    next();
});

app.use(express.static(__dirname));

// API endpoint to provide Supabase config to frontend
app.get('/api/config', (req, res) => {
    // Rate limiting would be added here in production
    try {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
            return res.status(500).json({ error: 'Server configuration error' });
        }
        
        res.json({
            supabaseUrl: process.env.SUPABASE_URL,
            supabaseKey: process.env.SUPABASE_ANON_KEY
        });
    } catch (error) {
        console.error('Config endpoint error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/quiz', (req, res) => {
    res.sendFile(path.join(__dirname, 'quiz_page.html'));
});

// Handle SPA routing - redirect unknown routes to home
app.get('*', (req, res) => {
    res.redirect('/');
});

app.listen(PORT, () => {
    const host = process.env.NODE_ENV === 'production' ? 'your-app-url' : 'localhost';
    console.log(`🚀 MathBubble server running on port ${PORT}`);
    console.log(`🏠 Home page: ${process.env.NODE_ENV === 'production' ? 'https://' + host : 'http://localhost:' + PORT}`);
    console.log(`📚 Login page: ${process.env.NODE_ENV === 'production' ? 'https://' + host + '/login' : 'http://localhost:' + PORT + '/login'}`);
    console.log(`🎯 Quiz page: ${process.env.NODE_ENV === 'production' ? 'https://' + host + '/quiz' : 'http://localhost:' + PORT + '/quiz'}`);
});