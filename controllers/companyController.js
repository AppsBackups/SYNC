const pool = require("../config/db");
const multer = require("multer");

// File upload config
const upload = multer({ dest: "uploads/" });

exports.uploadMiddleware = upload.fields([
  { name: "register_doc", maxCount: 1 },
  { name: "bank_doc", maxCount: 1 },
]);

exports.createCompany = async (req, res) => {
  const client = await pool.connect();
  try {
    // ✅ Step 0: Input Validations
    const requiredFields = ["company_uid", "company_name", "legal_form"];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({
          success: false,
          message: `Validation Error: '${field}' is required.`,
        });
      }
    }

    if (req.body.founding_year && isNaN(Number(req.body.founding_year))) {
      return res.status(400).json({
        success: false,
        message: "Validation Error: founding_year must be a number.",
      });
    }

    if (req.body.iban && req.body.iban.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Validation Error: IBAN must be at least 10 characters.",
      });
    }

    if (req.body.representatives) {
      try {
        JSON.parse(req.body.representatives);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: "Validation Error: representatives must be valid JSON.",
        });
      }
    }

    await client.query("BEGIN");

    // ✅ Step 1: Company
    const companyQuery = `
      INSERT INTO company 
        (company_uid, name, alt_name, legal_form, founding_year, website, is_registered, register_doc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `;
    const companyValues = [
      req.body.company_uid,
      req.body.company_name,
      req.body.alt_name || null,
      req.body.legal_form,
      req.body.founding_year || null,
      req.body.website || null,
      req.body.is_registered === "true" || req.body.is_registered === true,
      req.files?.register_doc ? req.files.register_doc[0].path : null,
    ];

    const companyResult = await client.query(companyQuery, companyValues);
    const companyId = companyResult.rows[0].id;

    // ✅ Step 2: Industry
    if (req.body.industry_code || req.body.sector) {
      const industryQuery = `
        INSERT INTO industry (company_id, industry_code, sector, description)
        VALUES ($1,$2,$3,$4)
      `;
      await client.query(industryQuery, [
        companyId,
        req.body.industry_code || null,
        req.body.sector || null,
        req.body.description || null,
      ]);
    }

    // ✅ Step 3: Location
    if (req.body.city || req.body.country) {
      const locationQuery = `
        INSERT INTO company_location (company_id, street, number, phone, postal_code, city, country)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
      `;
      await client.query(locationQuery, [
        companyId,
        req.body.street || null,
        req.body.number || null,
        req.body.phone || null,
        req.body.postal_code || null,
        req.body.city || null,
        req.body.country || null,
      ]);
    }

    // ✅ Step 4: Representatives
    const representatives = JSON.parse(req.body.representatives || "[]");
    for (const rep of representatives) {
      if (!rep.first_name || !rep.last_name) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "Validation Error: Representative must have first_name and last_name.",
        });
      }
      const repQuery = `
        INSERT INTO representatives
          (company_id, title, first_name, last_name, dob, country, phone, share_percent, email,
           role_authorized_signatory, role_beneficial_owner, role_contact_person)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `;
      await client.query(repQuery, [
        companyId,
        rep.title || null,
        rep.first_name,
        rep.last_name,
        rep.dob || null,
        rep.country || null,
        rep.phone || null,
        rep.share_percent || null,
        rep.email || null,
        rep.role_authorized_signatory || false,
        rep.role_beneficial_owner || false,
        rep.role_contact_person || false,
      ]);
    }

    // ✅ Step 5: Bank Info
    if (req.body.iban || req.body.financial_institution) {
      const bankQuery = `
        INSERT INTO bank_info (company_id, iban, account_holder, country, city, postal_code, financial_institution, bank_doc)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `;
      await client.query(bankQuery, [
        companyId,
        req.body.iban || null,
        req.body.account_holder || null,
        req.body.bank_country || null,
        req.body.bank_city || null,
        req.body.bank_postal || null,
        req.body.financial_institution || null,
        req.files?.bank_doc ? req.files.bank_doc[0].path : null,
      ]);
    }

    await client.query("COMMIT");
    res.json({ success: true, companyId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error creating company:", err.message);
    res.status(500).json({
      success: false,
      message: "Server Error: Failed to save company data.",
      details: err.message,
    });
  } finally {
    client.release();
  }
};
