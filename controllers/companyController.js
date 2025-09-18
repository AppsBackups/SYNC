const pool = require("../config/db");
const multer = require( "multer");

const upload = multer({ dest: "uploads/" });

exports.uploadMiddleware = upload.fields([
  { name: "register_doc", maxCount: 1 },
  { name: "bank_doc", maxCount: 1 }
]);

exports.createCompany = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1: Company
    const companyQuery = `
      INSERT INTO company (company_uid, name, alt_name, legal_form, founding_year, website, is_registered, register_doc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id
    `;
    const companyValues = [
      req.body.company_uid,
      req.body.company_name,
      req.body.alt_name,
      req.body.legal_form,
      req.body.founding_year,
      req.body.website,
      req.body.is_registered === "true" || req.body.is_registered === true, 
      req.files.register_doc ? req.files.register_doc[0].path : null
    ];
    const companyResult = await client.query(companyQuery, companyValues);
    const companyId = companyResult.rows[0].id;

    // Step 2: Industry
    const industryQuery = `
      INSERT INTO industry (company_id, industry_code, sector, description)
      VALUES ($1,$2,$3,$4)
    `;
    await client.query(industryQuery, [
      companyId,
      req.body.industry_code,
      req.body.sector,
      req.body.description
    ]);

    // Step 3: Location
    const locationQuery = `
      INSERT INTO company_location (company_id, street, number, phone, postal_code, city, country)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `;
    await client.query(locationQuery, [
      companyId,
      req.body.street,
      req.body.number,
      req.body.phone,
      req.body.postal_code,
      req.body.city,
      req.body.country
    ]);

    // Step 4: Representatives (Array of JSON objects)
    const representatives = JSON.parse(req.body.representatives || "[]");
    for (const rep of representatives) {
      const repQuery = `
        INSERT INTO representatives
        (company_id, title, first_name, last_name, dob, country, phone, share_percent, email,
         role_authorized_signatory, role_beneficial_owner, role_contact_person)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `;
      await client.query(repQuery, [
        companyId,
        rep.title,
        rep.first_name,
        rep.last_name,
        rep.dob,
        rep.country,
        rep.phone,
        rep.share_percent,
        rep.email,
        rep.role_authorized_signatory || false,
        rep.role_beneficial_owner || false,
        rep.role_contact_person || false
      ]);
    }

    // Step 5: Bank Info
    const bankQuery = `
      INSERT INTO bank_info (company_id, iban, account_holder, country, city, postal_code, financial_institution, bank_doc)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `;
    await client.query(bankQuery, [
      companyId,
      req.body.iban,
      req.body.account_holder,
      req.body.bank_country,
      req.body.bank_city,
      req.body.bank_postal,
      req.body.financial_institution,
      req.files.bank_doc ? req.files.bank_doc[0].path : null
    ]);

    await client.query("COMMIT");
    res.json({ success: true, companyId });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to save company data" });
  } finally {
    client.release();
  }
};
