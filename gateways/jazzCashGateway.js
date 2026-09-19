import crypto from "crypto";

// =====================================================
// JazzCash — Page Redirect (Hosted Checkout) API
//
// Docs: https://sandbox.jazzcash.com.pk (Payment Gateway Integration Guide for Merchants)
// Flow: build a signed set of pp_* fields -> render an auto-submitting HTML
// form that POSTs them to the checkout URL -> customer pays on JazzCash's
// page -> JazzCash POSTs the result back to pp_ReturnURL (our backend).
//
// ⚠️ VERIFY BEFORE GOING LIVE:
// JazzCash occasionally tweaks required fields / txn types between merchant
// onboarding packs. Confirm pp_TxnType and the exact field list against the
// integration guide your JazzCash relationship manager sends you. This
// implementation uses the commonly documented Mobile Wallet + Card
// Page-Redirect flow (pp_TxnType = "MWALLET").
// =====================================================

const getJazzCashBaseUrl = () => {
  return process.env.JAZZCASH_MODE === "live"
    ? "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform"
    : "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform";
};

const getConfig = () => {
  const merchantId = process.env.JAZZCASH_MERCHANT_ID;
  const password = process.env.JAZZCASH_PASSWORD;
  const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;

  if (!merchantId || !password || !integritySalt) {
    throw new Error("JazzCash credentials are not configured.");
  }

  return { merchantId, password, integritySalt };
};

const pad = (value, length) => String(value).padStart(length, "0");

const formatDateTime = (date) => {
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1, 2) +
    pad(date.getDate(), 2) +
    pad(date.getHours(), 2) +
    pad(date.getMinutes(), 2) +
    pad(date.getSeconds(), 2)
  );
};

// Alphabetically sort non-empty pp_* fields, join their values with "&",
// prefix the Integrity Salt, then HMAC-SHA256 the whole thing (salt is also
// the HMAC key). pp_SecureHash itself is excluded from the input.
const buildSecureHash = (fields, integritySalt) => {
  const sortedKeys = Object.keys(fields)
    .filter((key) => key !== "pp_SecureHash" && fields[key] !== "" && fields[key] != null)
    .sort();

  const joinedValues = sortedKeys.map((key) => fields[key]).join("&");
  const toBeHashed = `${integritySalt}&${joinedValues}`;

  return crypto
    .createHmac("sha256", integritySalt)
    .update(toBeHashed)
    .digest("hex");
};

// Build a safe, unique alphanumeric transaction reference (JazzCash allows
// alphanumerics plus "/" and "." — keep it simple and under 20 chars).
const buildTxnRefNo = (paymentId) => {
  const raw = `T${Date.now()}${paymentId.toString().slice(-6)}`;
  return raw.slice(0, 20);
};

export const createJazzCashCheckout = async ({
  paymentId,
  amount,
  billReference,
  description,
  returnUrl,
}) => {
  const { merchantId, password, integritySalt } = getConfig();

  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

  const fields = {
    pp_Version: "1.1",
    pp_TxnType: "MWALLET",
    pp_Language: "EN",
    pp_MerchantID: merchantId,
    pp_Password: password,
    pp_TxnRefNo: buildTxnRefNo(paymentId),
    // JazzCash amounts are in paisa (rupees * 100), no decimal point.
    pp_Amount: String(Math.round(Number(amount) * 100)),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: formatDateTime(now),
    pp_BillReference: billReference || "billRef",
    pp_Description: description || "POS Payment",
    pp_TxnExpiryDateTime: formatDateTime(expiry),
    pp_ReturnURL: returnUrl,
    pp_IsRegisteredCustomer: "N",
  };

  const secureHash = buildSecureHash(fields, integritySalt);

  return {
    checkoutUrl: getJazzCashBaseUrl(),
    txnRefNo: fields.pp_TxnRefNo,
    fields: {
      ...fields,
      pp_SecureHash: secureHash,
    },
  };
};

// Verify the POST JazzCash sends back to pp_ReturnURL. Returns the parsed
// result and whether the hash actually checks out — never trust the fields
// (especially pp_ResponseCode) before this passes.
export const verifyJazzCashReturn = (fields) => {
  const { integritySalt } = getConfig();

  const receivedHash = fields.pp_SecureHash || "";
  const recomputed = buildSecureHash(fields, integritySalt);

  const receivedBuf = Buffer.from(receivedHash, "utf8");
  const recomputedBuf = Buffer.from(recomputed, "utf8");

  const isValid =
    Boolean(receivedHash) &&
    receivedBuf.length === recomputedBuf.length &&
    crypto.timingSafeEqual(receivedBuf, recomputedBuf);

  return {
    isValid,
    txnRefNo: fields.pp_TxnRefNo,
    responseCode: fields.pp_ResponseCode,
    responseMessage: fields.pp_ResponseMessage,
    // "000" = success. "002" = cancelled by user. Anything else = failed/pending.
    isSuccess: fields.pp_ResponseCode === "000",
    amount: fields.pp_Amount ? Number(fields.pp_Amount) / 100 : null,
    retrievalReferenceNo: fields.pp_RetreivalReferenceNo,
    raw: fields,
  };
};