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

    // === HEADER ===
    doc.rect(50, 50, 20, 20).fillColor("#000000").fill();
    doc.rect(65, 50, 10, 10).fillColor("#f1c40f").fill();

    doc.fillColor("#000000").font("Helvetica").fontSize(10);
    doc.text("Your Company Name", 90, 50);
    doc.text(`Invoice No : ${data.uuid || "INV-" + Date.now()}`, 90, 65);
    doc.text(`Date : ${data.timestamp}`, 90, 80);

    doc.fontSize(20).font("Helvetica-Bold").fillColor("#000000").text("INVOICE", 400, 50);
    doc.moveTo(400, 70).lineTo(490, 70).lineWidth(2).strokeColor("#f1c40f").stroke();

    doc.fontSize(12).font("Helvetica").fillColor("#000000").text("-1", 520, 90);

    // === TABLE HEADER ===
    const tableTop = 150;
    const colX = { item: 50, qty: 260, price: 360, total: 460 };

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
    doc.rect(50, tableTop - 15, 500, 20).fill("#f8f8f8");
    doc.fillColor("#000000");
    doc.text("Item", colX.item, tableTop - 12);
    doc.text("Qty", colX.qty, tableTop - 12);
    doc.text("Price", colX.price, tableTop - 12);
    doc.text("Total", colX.total, tableTop - 12);

    doc.moveTo(50, tableTop + 5).lineTo(550, tableTop + 5).strokeColor("#cccccc").lineWidth(1).stroke();

    // === TABLE ROWS ===
    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    let y = tableTop + 20;
    let subtotal = 0;

    data.items.forEach((item, i) => {
      subtotal += item.lineAmount;

      doc.text(item.name, colX.item, y);
      doc.text(item.quantity.toString(), colX.qty, y);
      doc.text(`CHF ${item.unitPrice.toFixed(2)}`, colX.price, y, { width: 80, align: "right" });
      doc.text(`CHF ${item.lineAmount.toFixed(2)}`, colX.total, y, { width: 80, align: "right" });

      y += 20;

      if (i < data.items.length - 1) {
        doc.moveTo(50, y - 5).lineTo(550, y - 5).strokeColor("#eeeeee").lineWidth(0.5).stroke();
      }
    });

    // === FOOTER THANK YOU + LOGO ===
    const footerY = 720;
    doc.font("Helvetica").fontSize(10).fillColor("#000000").text("Thank you", 50, footerY);
    doc.rect(500, footerY - 10, 45, 20).fillColor("#f1c40f").fill();
    doc.fillColor("#000000").fontSize(8).text("strokhor", 505, footerY - 5);

    // === SUMMARY (aligned with footer) ===
    const discountValue = data.discount?.percent
      ? subtotal * (data.discount.percent / 100)
      : (data.discount?.amount || 0);

    const vatValue = data.vat || 0;
    const tipValue = data.tipAmount || 0;
    const total = data.totalAmount || (subtotal - discountValue + vatValue + tipValue);

    let summaryY = footerY - 120; // lift summary above footer
    const labelX = 350;
    const valueX = 500;

    // dashed separator
    doc.moveTo(300, summaryY - 10).lineTo(550, summaryY - 10).dash(3, { space: 2 }).strokeColor("#999999").stroke().undash();

    doc.font("Helvetica").fontSize(10).fillColor("#000000");
    doc.text("Subtotal", labelX, summaryY); doc.text(`CHF ${subtotal.toFixed(2)}`, valueX, summaryY, { align: "right" }); summaryY += 15;
    doc.text("Discount", labelX, summaryY); doc.text(`CHF ${discountValue.toFixed(2)}`, valueX, summaryY, { align: "right" }); summaryY += 15;
    doc.text("Tip", labelX, summaryY); doc.text(`CHF ${tipValue.toFixed(2)}`, valueX, summaryY, { align: "right" }); summaryY += 15;
    doc.text("VAT", labelX, summaryY); doc.text(`CHF ${vatValue.toFixed(2)}`, valueX, summaryY, { align: "right" }); summaryY += 20;

    doc.font("Helvetica-Bold").fontSize(12);
    doc.text("Total", labelX, summaryY);
    doc.text(`CHF ${total.toFixed(2)}`, valueX, summaryY, { align: "right" });

    // finish
    doc.end();

    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

