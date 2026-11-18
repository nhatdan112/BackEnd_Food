
const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');
const mongoose = require('mongoose');

// ======================================================
// LOGGER
// ======================================================

const startedAt = Date.now();
let server = null;
let isShuttingDown = false;

const logger = {
  info(message, data = null) {
    console.log(`[${new Date().toISOString()}] [INFO] ${message}`, data ?? '');
  },

  success(message, data = null) {
    console.log(`[${new Date().toISOString()}] [SUCCESS] ${message}`, data ?? '');
  },

  warn(message, data = null) {
    console.warn(`[${new Date().toISOString()}] [WARN] ${message}`, data ?? '');
  },

  error(message, error = null) {
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`);

    if (error) {
      console.error({
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
    }
  },

  section(title) {
    console.log('\n' + '='.repeat(65));
    console.log(` ${title}`);
    console.log('='.repeat(65));
  },
};

// ======================================================
// SYSTEM MONITORING
// ======================================================

function logSystemInfo() {
  const memory = process.memoryUsage();

  logger.info('SYSTEM INFORMATION', {
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rss: `${(memory.rss / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memory.external / 1024 / 1024).toFixed(2)} MB`,
    },
  });
}

// ======================================================
// MONGODB MONITORING
// ======================================================

function setupDatabaseMonitoring() {
  const db = mongoose.connection;

  db.on('connected', () => {
    logger.success('MongoDB connected', {
      database: db.name,
      host: db.host,
      port: db.port,
      readyState: db.readyState,
    });
  });

  db.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  db.on('reconnected', () => {
    logger.success('MongoDB reconnected');
  });

  db.on('error', (error) => {
    logger.error('MongoDB connection error', error);
  });

  db.on('connecting', () => {
    logger.info('MongoDB connecting...');
  });

  db.on('close', () => {
    logger.warn('MongoDB connection closed');
  });
}

// ======================================================
// SERVER SHUTDOWN
// ======================================================

async function shutdown(reason, exitCode = 0) {
  if (isShuttingDown) return;

  isShuttingDown = true;

  logger.section('SERVER SHUTDOWN');
  logger.warn(`Shutdown signal received: ${reason}`);

  try {
    if (server && server.listening) {
      logger.info('Closing HTTP server...');

      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      logger.success('HTTP server closed');
    }

    if (mongoose.connection.readyState !== 0) {
      logger.info('Closing MongoDB connection...');

      await mongoose.disconnect();

      logger.success('MongoDB disconnected safely');
    }

    logger.success('Shutdown completed');
  } catch (error) {
    logger.error('Error during shutdown', error);
    exitCode = 1;
  } finally {
    logger.info(`Process exiting with code ${exitCode}`);
    process.exitCode = exitCode;
  }
}

// ======================================================
// PROCESS ERROR MONITORING
// ======================================================

process.on('uncaughtException', (error) => {
  logger.error('UNCAUGHT EXCEPTION', error);
  shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(
    'UNHANDLED PROMISE REJECTION',
    reason instanceof Error
      ? reason
      : new Error(String(reason))
  );

  shutdown('unhandledRejection', 1);
});

process.on('warning', (warning) => {
  logger.warn('NODE.JS WARNING', warning);
});

process.on('exit', (code) => {
  logger.info(`Node.js process exited: ${code}`);
});

// ======================================================
// START SERVER
// ======================================================

async function main() {
  logger.section('FOODFINDER BACKEND STARTING');

  logger.info('Loading configuration...', {
    environment: process.env.NODE_ENV || 'development',
    port: env.port,
    aiProvider: env.aiProvider,
  });

  // Setup MongoDB listeners before connecting
  setupDatabaseMonitoring();

  // Connect MongoDB
  logger.info('Connecting to MongoDB...');

  await connectDB();

  logger.success('Database initialization completed');

  // Start Express server
  server = app.listen(env.port, () => {
    const address = server.address();

    logger.section('FOODFINDER BACKEND RUNNING');

    logger.success('HTTP server started', {
      url: `http://localhost:${env.port}`,
      port: address.port,
      pid: process.pid,
      environment: process.env.NODE_ENV || 'development',
    });

    logger.info('AI CONFIGURATION', {
      provider: env.aiProvider,
    });

    logger.info('DATABASE STATUS', {
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      readyState: mongoose.connection.readyState,
    });

    logger.info('AVAILABLE ENDPOINTS', {
      health: 'GET /api/health',
      auth: '/api/auth',
      places: '/api/places',
      areas: '/api/areas',
      users: '/api/users',
      ai: '/api/ai',
    });

    logSystemInfo();

    logger.section('SERVER READY');
  });

  // HTTP server errors
  server.on('error', (error) => {
    logger.error('HTTP SERVER ERROR', error);
    shutdown('HTTP server error', 1);
  });

  // HTTP server closed
  server.on('close', () => {
    logger.warn('HTTP server close event');
  });
}

// ======================================================
// GRACEFUL SHUTDOWN SIGNALS
// ======================================================

process.on('SIGINT', () => {
  shutdown('SIGINT (Ctrl + C)');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

// ======================================================
// GLOBAL ERROR HANDLING
// ======================================================

main().catch(async (error) => {
  logger.section('STARTUP FAILED');
  logger.error('FoodFinder backend failed to start', error);

  await shutdown('Startup failure', 1);
});
