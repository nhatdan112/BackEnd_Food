
const app = require('../src/app');
const connectDB = require('../src/config/db');

let dbConnectionPromise;

async function ensureDB() {
  if (!dbConnectionPromise) {
    dbConnectionPromise = connectDB().catch((err) => {
      dbConnectionPromise = null;
      throw err;
    });
  }

  await dbConnectionPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureDB();

    return app(req, res);
  } catch (err) {
    console.error('[VERCEL ERROR]', err);

    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: process.env.NODE_ENV === 'development'
        ? err.message
        : undefined
    });
  }
};
