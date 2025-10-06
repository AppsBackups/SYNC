const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const syncRoutes = require('./routes/syncRoute');
const transactionRoutes = require('./routes/transactionRoutes');
const pairingRoutes = require('./routes/pairingRoutes');
const planRoutes = require('./routes/planroute');
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());

const pool = require("./config/db");
const receiptRoutes = require("./routes/receiptRoutes");
const authRoutes = require("./routes/authRoutes");
const tableRoutes = require("./routes/tableRoutes");
const companyRoutes = require("./routes/companyRoutes");







const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*', 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 
};

app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));

app.use('/api', syncRoutes ,transactionRoutes ,planRoutes , tableRoutes);
app.use('/api/pairing', pairingRoutes);
// Middleware

app.use("/receipts", express.static(path.join(__dirname, "receipts"))); // Serve PDFs
app.use("/api", receiptRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", companyRoutes);



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