import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// API endpoint to provide Supabase config to frontend
app.get('/api/config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_ANON_KEY
    });
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