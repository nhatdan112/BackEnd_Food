
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const routes = require('./routes');
const {
  notFound,
  errorHandler,
} = require('./middleware/errorHandler');

const app = express();

// ======================================================
// APPLICATION CONFIGURATION
// ======================================================

app.disable('x-powered-by');

// ======================================================
// HTTP REQUEST LOGGER
// ======================================================

morgan.token('request-id', (req) => {
  return req.headers['x-request-id'] || '-';
});

app.use(
  morgan(
    ':date[iso] :request-id :remote-addr :method :url :status :response-time ms - :res[content-length] bytes',
    {
      skip: (req) => req.path === '/api/health',
    }
  )
);

// ======================================================
// SECURITY - HELMET
// ======================================================

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

// ======================================================
// CORS
// ======================================================

app.use(
  cors({
    origin:
      env.corsOrigin === '*'
        ? true
        : env.corsOrigin.split(',').map((s) => s.trim()),
  })
);

// ======================================================
// BODY PARSER
// ======================================================

// Default JSON limit: 1 MB
const jsonDefault = express.json({
  limit: '1mb',
});

// Photo upload JSON limit: 6 MB
const jsonPhoto = express.json({
  limit: '6mb',
});

// Upload photo route uses larger JSON payload
app.use((req, res, next) => {
  const isPhotoUpload = /^\/api\/places\/[^/]+\/photos$/.test(
    req.path
  );

  const parser = isPhotoUpload
    ? jsonPhoto
    : jsonDefault;

  parser(req, res, next);
});

// ======================================================
// STATIC FILES - USER UPLOADS
// ======================================================

app.use(
  '/uploads',
  express.static(env.uploadsDir, {
    maxAge: '7d',
    index: false,
    dotfiles: 'deny',
  })
);

// ======================================================
// RATE LIMITING
// ======================================================

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,

  handler: (req, res) => {
    console.warn(
      `[RATE LIMIT] ${req.method} ${req.originalUrl} - ${req.ip}`
    );

    res.status(429).json({
      success: false,
      message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.',
    });
  },
});

app.use('/api', apiLimiter);

// ======================================================
// API ROUTES
// ======================================================

app.use('/api', routes);

// ======================================================
// 404 HANDLER
// ======================================================

app.use(notFound);

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================

app.use(errorHandler);

// ======================================================
// EXPORT APPLICATION
// ======================================================

module.exports = app;
