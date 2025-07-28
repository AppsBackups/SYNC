const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const syncRoutes = require('./routes/syncRoute');
const transactionRoutes = require('./routes/transactionRoutes');
const pairingRoutes = require('./routes/pairingRoutes');
const planRoutes = require('./routes/planroute');
const path = require("path");
const fs = require("fs");

const pool = require("./config/db");
const receiptRoutes = require("./routes/receiptRoutes");
const authRoutes = require("./routes/authRoutes");




const app = express();


const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

app.use('/api', syncRoutes ,transactionRoutes ,planRoutes );
app.use('/api/pairing', pairingRoutes);
// Middleware

app.use("/receipts", express.static(path.join(__dirname, "receipts"))); // Serve PDFs
app.use("/api", receiptRoutes);
app.use("/api/auth", authRoutes);



app.get("/receipt/:filename", (req, res) => {
  const filePath = path.join("/tmp/receipts", req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath); // or res.sendFile(filePath) to view in browser
  } else {
    res.status(404).json({ error: "File not found" });
  }
});


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