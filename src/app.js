/**
 * ============================================================================
 * APP.JS - Express Application Setup
 * ============================================================================
 * Single Database Architecture
 * - No multi-tenant resolver middleware
 * - Simple, straightforward middleware chain
 * - Only 2 rate limiters: authLimiter (login), apiLimiter (general)
 * ============================================================================
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const requestLogger = require('./middleware/requestLogger');
const { apiLimiter } = require('./config/rateLimiter');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ============================================================================
// SECURITY & PARSING
// ============================================================================
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: true,          
  credentials: true      
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// LOGGING & RATE LIMITING
// ============================================================================

app.use(requestLogger);
app.use(apiLimiter);

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// ============================================================================
// API ROUTES
// ============================================================================

app.use('/api', routes);

// ============================================================================
// ERROR HANDLER (Must be last)
// ============================================================================

app.use(errorHandler);

module.exports = app;