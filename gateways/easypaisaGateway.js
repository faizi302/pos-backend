import crypto from "crypto";

// =====================================================
// EasyPaisa — Open API Hosted Checkout
//
// Flow: build a signed request -> render an auto-submitting HTML form that
// POSTs it to the EasyPaisa checkout URL -> customer pays on EasyPaisa's
// page -> EasyPaisa POSTs the result back to postBackURL (our backend).
//
// ⚠️ VERIFY BEFORE GOING LIVE:
// EasyPaisa's merchantHashedReq field order / algorithm has drifted between
// versions of their integration PDF in the wild (their team sends it during
// merchant onboarding — ask for the current "Easypay Merchant Integration
// Guide"). This implementation uses the commonly documented pattern: sort
// non-empty fields alphabetically, join "key=value&", HMAC-SHA256 with the
// merchant Hash Key. Re-confirm the field list/order against your onboarding
// PDF and their sandbox hash calculator before enabling live traffic.
// =====================================================

const getEasyPaisaBaseUrl = () => {
  return process.env.EASYPAISA_MODE === "live"
    ? "https://easypay.easypaisa.com.pk/easypay/Index.jsf"
    : "https://easypaystg.easypaisa.com.pk/easypay/Index.jsf";
};

const getConfig = () => {
  const storeId = process.env.EASYPAISA_STORE_ID;
  const hashKey = process.env.EASYPAISA_HASH_KEY;

  if (!storeId || !hashKey) {
    throw new Error("EasyPaisa credentials are not configured.");
  }

  return { storeId, hashKey };
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

const buildHash = (fields, hashKey) => {
  const sortedKeys = Object.keys(fields)
    .filter(
      (key) =>
        key !== "merchantHashedReq" && fields[key] !== "" && fields[key] != null
    )
    .sort();

  const joined = sortedKeys.map((key) => `${key}=${fields[key]}`).join("&");

  return crypto.createHmac("sha256", hashKey).update(joined).digest("hex");
};

const buildOrderRefNum = (paymentId) => {
  return `PAY${paymentId.toString().slice(-10)}${Date.now().toString().slice(-6)}`.slice(
    0,
    20
  );
};

export const createEasyPaisaCheckout = async ({
  paymentId,
  amount,
  postBackURL,
}) => {
  const { storeId, hashKey } = getConfig();

  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const fields = {
    storeId,
    amount: Number(amount).toFixed(1), // EasyPaisa wants one decimal point, e.g. "1500.0"
    postBackURL,
    orderRefNum: buildOrderRefNum(paymentId),
    // "InitialRequest" = hosted redirection flow (customer enters wallet/card
    // details on EasyPaisa's own page rather than posting them to us).
    paymentMethod: "InitialRequest",
    emailAddr: "",
    mobileAccountNo: "",
    tokenExpiry: formatDateTime(expiry),
    bankIdentificationNumber: "",
    autoRedirect: "1",
  };

  const merchantHashedReq = buildHash(fields, hashKey);

  return {
    checkoutUrl: getEasyPaisaBaseUrl(),
    orderRefNum: fields.orderRefNum,
    fields: {
      ...fields,
      merchantHashedReq,
    },
  };
};

// Verify the POST EasyPaisa sends back to postBackURL.
export const verifyEasyPaisaReturn = (fields) => {
  const { hashKey } = getConfig();

  const receivedHash = fields.merchantHashedReq || fields.hashRequest || "";
  const recomputed = buildHash(fields, hashKey);

  const receivedBuf = Buffer.from(receivedHash, "utf8");
  const recomputedBuf = Buffer.from(recomputed, "utf8");

  const isValid =
    Boolean(receivedHash) &&
    receivedBuf.length === recomputedBuf.length &&
    crypto.timingSafeEqual(receivedBuf, recomputedBuf);

  // EasyPaisa's success indicator is typically responseCode "0000" /
  // status "success" — confirm the exact value against your sandbox
  // responses, it has varied by integration type in the wild.
  const responseCode = fields.responseCode || fields.status;
  const isSuccess = responseCode === "0000" || responseCode === "0";

  return {
    isValid,
    orderRefNum: fields.orderRefNum,
    responseCode,
    responseDesc: fields.responseDesc || fields.desc,
    isSuccess,
    amount: fields.amount ? Number(fields.amount) : null,
    transactionId: fields.transactionId || fields.easypaisaTransactionId,
    raw: fields,
  };
};