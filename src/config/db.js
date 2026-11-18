const mongoose = require('mongoose');
const env = require('./env');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongodbUri);
  console.log(`[mongo] Đã kết nối MongoDB (${mongoose.connection.name})`);

  mongoose.connection.on('error', (err) => {
    console.error('[mongo] Lỗi kết nối:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] Mất kết nối MongoDB.');
  });
}

module.exports = connectDB;
