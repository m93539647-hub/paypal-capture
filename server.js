import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

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
app.use(express.json());

// PayPal credentials from .env
const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE = "https://api-m.sandbox.paypal.com";

// Get access token
async function getAccessToken() {
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": "Basic " + Buffer.from(PAYPAL_CLIENT + ":" + PAYPAL_SECRET).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json();
  return data.access_token;
}

// Create order
app.post("/create-order", async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "AUTHORIZE",
        purchase_units: [{ amount: { currency_code: currency || "USD", value: amount || "10.00" } }]
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error in /create-order:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Authorize order
app.post("/authorize-order", async (req, res) => {
  try {
    const { orderId } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/authorize`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error in /authorize-order:", err);
    res.status(500).json({ error: "Failed to authorize order" });
  }
});

// Capture payment
app.post("/capture", async (req, res) => {
  try {
    const { authorizationId } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE}/v2/payments/authorizations/${authorizationId}/capture`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ final_capture: true })
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error in /capture:", err);
    res.status(500).json({ error: "Failed to capture payment" });
  }
});

// Void authorization
app.post("/void", async (req, res) => {
  try {
    const { authorizationId } = req.body;
    const accessToken = await getAccessToken();

    const response = await fetch(`${PAYPAL_BASE}/v2/payments/authorizations/${authorizationId}/void`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Error in /void:", err);
    res.status(500).json({ error: "Failed to void authorization" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
