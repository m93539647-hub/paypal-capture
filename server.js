import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 10000;

// CORS setup
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
// Switch sandbox/live by changing PAYPAL_BASE
const PAYPAL_BASE = process.env.PAYPAL_MODE === "live"
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";

// Get access token
async function getAccessToken() {
  try {
    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    const data = await res.json();
    if (data.error) {
      console.error("PayPal token error:", data);
      throw new Error(data.error_description || "Failed to get access token");
    }

    console.log("✅ Access token fetched");
    return data.access_token;
  } catch (err) {
    console.error("Error fetching access token:", err);
    throw err;
  }
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

// Health check
app.get("/", (req, res) => res.send("✅ PayPal server is running"));

// Render-ready port binding
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
