const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

if (!process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`ArenaHub API listening on port ${PORT}`));
  });
}

module.exports = app;
