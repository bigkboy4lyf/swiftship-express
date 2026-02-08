const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import routes
const quoteRoutes = require('./routes/quotes');
const shipmentRoutes = require('./routes/shipments');
const authRoutes = require('./routes/auth');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ IMPORTANT: Serve static files from frontend folder
// This makes CSS, JS, and images available
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/img', express.static(path.join(__dirname, '../frontend/img')));

// API Routes
app.use('/api/quotes', quoteRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/auth', authRoutes);

// ✅ Serve HTML files with correct paths
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.get('/quote', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/quote.html'));
});

app.get('/services/express-delivery', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/express-delivery.html'));
});

app.get('/services/international-shipping', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/international-shipping.html'));
});

app.get('/services/cargo-freight', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/cargo-freight.html'));
});

// Catch-all route for 404 - must be LAST
app.get('*', (req, res) => {
    res.status(404).sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser`);
    console.log(`📁 Frontend files served from: ${path.join(__dirname, '../frontend')}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});