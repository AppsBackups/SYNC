const fs = require("fs-extra");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");

// Use /tmp for Render
const receiptsDir = "/tmp/receipts";
fs.ensureDirSync(receiptsDir);

exports.generateReceipt = async (req, res) => {
  try {
    const receiptData = req.body;
    const receiptId = uuidv4();
    const pdfPath = path.join(receiptsDir, `${receiptId}.pdf`);

    await generatePDF(receiptData, pdfPath);

    const receiptUrl = `${req.protocol}://${req.get("host")}/receipt/${receiptId}.pdf`;
    res.status(200).json({ receiptId, receiptUrl });

  } catch (err) {
    console.error("Receipt PDF generation failed:", err);
    res.status(500).json({
      error: "Failed to generate receipt.",
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};

async function generatePDF(data, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    // === Header ===
    doc.fontSize(24).text("RECEIPT", { align: "center" });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Date: ${data.timestamp}`);
    doc.text(`Payment Method: ${data.paymentMethod}`);
    if (data.customer) {
      doc.text(`Customer Name: ${data.customer.name}`);
      doc.text(`Customer Email: ${data.customer.email}`);
    }
    doc.moveDown();

    // === Table Header ===
    const startY = doc.y;
    const colX = {
      item: 50,
      qty: 200,
      unitPrice: 260,
      lineTotal: 340,
      vat: 430,
    };

    doc.font("Helvetica-Bold");
    doc.text("Item", colX.item, startY);
    doc.text("Qty", colX.qty, startY, { width: 40, align: "right" });
    doc.text("Unit Price", colX.unitPrice, startY, { width: 60, align: "right" });
    doc.text("Line Total", colX.lineTotal, startY, { width: 60, align: "right" });
    doc.text("VAT", colX.vat, startY, { width: 60, align: "right" });

    // Draw line under header
    doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
    doc.moveDown(0.5);

    // === Table Rows ===
    doc.font("Helvetica");
    let subtotal = 0;
    data.items.forEach(item => {
      const y = doc.y;
      doc.text(item.name, colX.item, y);
      doc.text(item.quantity.toString(), colX.qty, y, { width: 40, align: "right" });
      doc.text(item.unitPrice.toFixed(2), colX.unitPrice, y, { width: 60, align: "right" });
      doc.text(item.lineAmount.toFixed(2), colX.lineTotal, y, { width: 60, align: "right" });
      doc.text(item.vatAmount.toFixed(2), colX.vat, y, { width: 60, align: "right" });

      // Line under row
      doc.moveTo(50, doc.y + 15).lineTo(550, doc.y + 15).stroke();
      doc.moveDown();
      subtotal += item.lineAmount;
    });

    // === Summary ===
    doc.moveDown(2);
    doc.font("Helvetica-Bold");
    const labelX = 330;
    const valueX = 430;
    const rowGap = 20;
    let currentY = doc.y;

    doc.text("Subtotal:", labelX, currentY, { width: 100, align: "right" });
    doc.text(subtotal.toFixed(2), valueX, currentY, { width: 80, align: "right" });

    currentY += rowGap;
    doc.text("VAT:", labelX, currentY, { width: 100, align: "right" });
    doc.text((data.vat || 0).toFixed(2), valueX, currentY, { width: 80, align: "right" });

    currentY += rowGap;
    doc.text("Tip:", labelX, currentY, { width: 100, align: "right" });
    doc.text((data.tipAmount || 0).toFixed(2), valueX, currentY, { width: 80, align: "right" });

    const discountValue = data.discount?.percent
      ? `${data.discount.percent}%`
      : `${data.discount?.amount?.toFixed(2) || "0.00"}`;

    currentY += rowGap;
    doc.text("Discount:", labelX, currentY, { width: 100, align: "right" });
    doc.text(discountValue, valueX, currentY, { width: 80, align: "right" });

    // === Total ===
    currentY += rowGap + 10;
    doc.fontSize(14).font("Helvetica-Bold");
    doc.text("Total:", labelX, currentY, { width: 100, align: "right" });
    doc.text(data.totalAmount.toFixed(2), valueX, currentY, { width: 80, align: "right" });

    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}
