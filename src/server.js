require('dotenv').config();
const http                  = require('http');
const connectDB             = require('./config/db');
const app                   = require('./app');
const { initSocket }        = require('./socket');
const { startPushScheduler } = require('./utils/pushScheduler');
const { startAbandonedCartJob } = require('./utils/abandonedCartJob');

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  startPushScheduler();
  startAbandonedCartJob();

  const server = http.createServer(app);
  initSocket(server);

  server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
};

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
