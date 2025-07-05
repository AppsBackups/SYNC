const fs = require("fs-extra");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const puppeteer = require("puppeteer");

// Use /tmp directory (writable on Render)
const receiptsDir = "/tmp/receipts";
fs.ensureDirSync(receiptsDir);

exports.generateReceipt = async (req, res) => {
  try {
    const receiptData = req.body;
    const receiptId = uuidv4();
    const pdfPath = path.join(receiptsDir, `${receiptId}.pdf`);

    await generatePDF(receiptData, pdfPath);

    // Either:
    // ✅ Upload this PDF to S3 or Firebase and return public URL
    // ❌ OR: Just return the file path (but not public on Render unless served manually)
    res.status(200).json({ receiptId, receiptPath: pdfPath });
  }catch (err) {
  console.error("Receipt PDF generation failed:", err);
  res.status(500).json({
    error: "Failed to generate receipt.",
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
}

};

async function generatePDF(data, outputPath) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process"
    ]
  });

  const page = await browser.newPage();

  const templatePath = path.join(__dirname, "../templates/receiptTemplate.html");
  let html = await fs.readFile(templatePath, "utf8");

  const customerHtml = data.customer
    ? `<p><strong>Customer:</strong> ${data.customer.name} (${data.customer.email})</p>`
    : "";

  const itemsHtml = data.items
    .map(item => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>${item.unitPrice}</td>
        <td>${item.lineAmount}</td>
        <td>${item.vatAmount.toFixed(2)}</td>
      </tr>`).join("");

  const subtotal = data.items.reduce((sum, i) => sum + i.lineAmount, 0);

  html = html
    .replace("{{timestamp}}", data.timestamp || new Date().toISOString())
    .replace("{{paymentMethod}}", data.paymentMethod || "-")
    .replace("{{customer}}", customerHtml)
    .replace("{{items}}", itemsHtml)
    .replace("{{subtotal}}", subtotal.toFixed(2))
    .replace("{{vat}}", (data.vat || 0).toFixed(2))
    .replace("{{tip}}", (data.tipAmount || 0).toFixed(2))
    .replace("{{discount}}", data.discount?.percent
        ? `${data.discount.percent}%`
        : `${data.discount?.amount?.toFixed(2) || '0.00'}`)
    .replace("{{total}}", data.totalAmount.toFixed(2));

  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.pdf({ path: outputPath, format: "A4" });
  await browser.close();
}
