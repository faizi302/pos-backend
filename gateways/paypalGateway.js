const getPayPalBaseUrl = () => {
  return process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
};

const getPayPalAccessToken = async () => {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal credentials are not configured.");
  }

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const response = await fetch(
    `${getPayPalBaseUrl()}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error_description ||
        data?.error ||
        "Failed to authenticate with PayPal."
    );
  }

  return data.access_token;
};

const paypalRequest = async (endpoint, options = {}) => {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalBaseUrl()}${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(options.headers || {}),
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        data?.details?.[0]?.description ||
        "PayPal API request failed."
    );

    error.statusCode = response.status;
    error.paypalResponse = data;

    throw error;
  }

  return data;
};

export const createPayPalOrder = async ({
  paymentId,
  amount,
  currency,
  description,
  returnUrl,
  cancelUrl,
}) => {
  const orderPayload = {
    intent: "CAPTURE",

    purchase_units: [
      {
        reference_id: paymentId.toString(),

        custom_id: paymentId.toString(),

        description,

        amount: {
          currency_code: currency,
          value: Number(amount).toFixed(2),
        },
      },
    ],

    application_context: {
      brand_name: "POS",
      landing_page: "LOGIN",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const data = await paypalRequest(
    "/v2/checkout/orders",
    {
      method: "POST",

      headers: {
        "PayPal-Request-Id": `payment-${paymentId}-${Date.now()}`,
        Prefer: "return=representation",
      },

      body: JSON.stringify(orderPayload),
    }
  );

  const approvalLink = data.links?.find(
    (link) => link.rel === "approve"
  );

  return {
    orderId: data.id,

    status: data.status,

    approvalUrl: approvalLink?.href || null,

    response: data,
  };
};

export const capturePayPalOrder = async (orderId) => {
  return paypalRequest(
    `/v2/checkout/orders/${orderId}/capture`,
    {
      method: "POST",

      headers: {
        "PayPal-Request-Id": `capture-${orderId}`,
        Prefer: "return=representation",
      },

      body: JSON.stringify({}),
    }
  );
};

export const getPayPalOrder = async (orderId) => {
  return paypalRequest(
    `/v2/checkout/orders/${orderId}`,
    {
      method: "GET",
    }
  );
};

export const verifyPayPalWebhook = async ({
  transmissionId,
  transmissionTime,
  transmissionSig,
  certUrl,
  authAlgo,
  webhookEvent,
}) => {
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${getPayPalBaseUrl()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",

      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: webhookEvent,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        "PayPal webhook verification failed."
    );

    error.statusCode = response.status;
    error.paypalResponse = data;

    throw error;
  }

  return data;
};