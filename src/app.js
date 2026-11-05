
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.corsOrigin === '*'
      ? true
      : env.corsOrigin.split(',').map((s) => s.trim()),
  }),
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Rate limiter chung cho API.
// Không giới hạn tile vì bản đồ thường tạo rất nhiều request.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,

    skip: (req) => {
      return req.originalUrl.startsWith('/api/map/tiles/');
    },

    message: {
      success: false,
      message: 'Too many requests, please try again later.',
    },
  }),
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
