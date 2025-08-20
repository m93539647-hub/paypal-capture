import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import cors from "cors";

dotenv.config();
const app = express();

// ✅ Enable CORS for your frontend domain
app.use(cors({
  origin: [
    "https://esoftwaresolution.online",
    "http://esoftwaresolution.online",
    "https://www.esoftwaresolution.online"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Handle preflight requests
app.options("*", cors());


app.use(express.json());

// ✅ MySQL Connection Pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

const clientId = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_SECRET;

// 🔑 Get PayPal Access Token
async function getAccessToken() {
  const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(clientId + ":" + secret).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json();
  return data.access_token;
}

// 🟢 Step 1: Create Order
app.post("/create-order", async (req, res) => {
  try {
    const { amount = "10.00", currency = "USD" } = req.body;
    const token = await getAccessToken();

    const response = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "AUTHORIZE",
        purchase_units: [{ amount: { currency_code: currency, value: amount } }],
      }),
    });

    const data = await response.json();

    if (data.id) {
      await db.query(
        "INSERT INTO transactions (order_id, status, amount, currency) VALUES (?, ?, ?, ?)",
        [data.id, data.status, amount, currency]
      );
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// 🟢 Step 2: Authorize Order
app.post("/authorize-order", async (req, res) => {
  try {
    const { orderId } = req.body;
    const token = await getAccessToken();

    const response = await fetch(
      `https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/authorize`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await response.json();

    if (data?.purchase_units?.[0]?.payments?.authorizations?.[0]) {
      const auth = data.purchase_units[0].payments.authorizations[0];
      await db.query(
        "UPDATE transactions SET status=?, payer_email=?, authorization_id=? WHERE order_id=?",
        [data.status, data.payer?.email_address || null, auth.id, orderId]
      );
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to authorize order" });
  }
});

// 🟢 Step 3: Capture Payment
app.post("/capture", async (req, res) => {
  try {
    const { authorizationId, amount = "10.00", currency = "USD" } = req.body;
    const token = await getAccessToken();

    const response = await fetch(
      `https://api-m.sandbox.paypal.com/v2/payments/authorizations/${authorizationId}/capture`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: { currency_code: currency, value: amount } }),
      }
    );

    const data = await response.json();

    if (data?.id) {
      await db.query(
        "UPDATE transactions SET status=?, capture_id=? WHERE authorization_id=?",
        [data.status, data.id, authorizationId]
      );
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to capture authorization" });
  }
});

// 🟢 Step 4: Void Authorization
app.post("/void", async (req, res) => {
  try {
    const { authorizationId } = req.body;
    const token = await getAccessToken();

    const response = await fetch(
      `https://api-m.sandbox.paypal.com/v2/payments/authorizations/${authorizationId}/void`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );

    if (response.status === 204) {
      await db.query("UPDATE transactions SET status=? WHERE authorization_id=?", ["VOIDED", authorizationId]);
      res.json({ message: "Authorization voided successfully" });
    } else {
      const data = await response.json();
      res.json(data);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to void authorization" });
  }
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
