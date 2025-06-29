const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const syncRoutes = require('./routes/syncRoute');
const pool = require("./config/db");

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error executing query:', err);
  } else {
    console.log('✅ Connected to DB:', res.rows);
  }
});

const app = express();


const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use('/api', syncRoutes);


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
const ENVIRONMENT = process.env.NODE_ENV || 'development';
const server = app.listen(PORT, () => {
  console.log(`Server running in ${ENVIRONMENT} mode on port ${PORT}`);
});


module.exports = server;