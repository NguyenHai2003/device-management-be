const express = require('express');
const cors = require('cors');
const monitorRoutes = require('./routes/monitorRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Enable CORS for frontend to allow connection to the SSE stream
app.use(cors());

// In case we want to parse JSON in the future
app.use(express.json());

// Routes
// Mount our system metrics API directly
app.use('/api', monitorRoutes);

// General route
app.get('/', (req, res) => {
  res.send('Device Management Backend API Server is running.');
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`SSE Stream available at http://localhost:${PORT}/api/system-metrics`);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
