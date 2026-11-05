const env = require('./config/env');
const connectDB = require('./config/db');
const app = require('./app');


async function main() {
  try {
    console.log('\n========================================');
    console.log('       FOODFINDER API SERVER');
    console.log('========================================');

    // 1. Connect MongoDB
    console.log('[DATABASE] Connecting to MongoDB...');

    await connectDB();

    console.log('[DATABASE] MongoDB connected successfully');

    // 2. Start HTTP server
    const server = app.listen(env.port, () => {
      const baseUrl = `http://localhost:${env.port}`;

      console.log('\n========================================');
      console.log('          SERVER STARTED');
      console.log('========================================');

      console.log(`[SERVER] Status      : ONLINE`);
      console.log(`[SERVER] Environment : ${env.nodeEnv}`);
      console.log(`[SERVER] URL         : ${baseUrl}`);
      console.log(`[SERVER] Health      : ${baseUrl}/api/health`);
      console.log(`[SERVER] API Monitor : ${baseUrl}/api/status`);

      console.log('----------------------------------------');

      console.log(`[DATABASE] MongoDB   : CONNECTED`);
      console.log(`[AI] Provider        : ${env.aiProvider}`);

      console.log('----------------------------------------');
      console.log('[SERVER] Waiting for requests...');
      console.log('========================================\n');
    });

    // 3. Server error handling
    server.on('error', (err) => {
      console.error('[SERVER ERROR]', err.message);

      if (err.code === 'EADDRINUSE') {
        console.error(`[SERVER] Port ${env.port} is already in use.`);
      }

      process.exit(1);
    });

    // 4. Graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n[SERVER] ${signal} received. Shutting down...`);

      server.close(async () => {
        try {
          const mongoose = require('mongoose');

          await mongoose.connection.close();

          console.log('[DATABASE] MongoDB disconnected');
          console.log('[SERVER] Shutdown completed');

          process.exit(0);
        } catch (err) {
          console.error('[SHUTDOWN ERROR]', err.message);
          process.exit(1);
        }
      });
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));

  } catch (err) {
    console.error('\n========================================');
    console.error('[STARTUP ERROR] FoodFinder failed to start');
    console.error('========================================');
    console.error(err.stack || err.message);

    process.exit(1);
  }
}

main();
