const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const syncRoutes = require('./routes/syncRoute');
const transactionRoutes = require('./routes/transactionRoutes');
const deviceRoutes = require('./routes/deviceRoutes');


const pool = require("./config/db");



const app = express();


const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use('/api', syncRoutes ,transactionRoutes);
app.use('/api', deviceRoutes);


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