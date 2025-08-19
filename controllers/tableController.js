const tableModel = require("../models/tableModel");

// Controller: List all tables
const listTables = async (req, res) => {
  try {
    const tables = await tableModel.getAllTables();
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Controller: Get data from a selected table
const getTable = async (req, res) => {
  try {
    const tableName = req.params.name;
    const rows = await tableModel.getTableData(tableName);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  listTables,
  getTable,
};
