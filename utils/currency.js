const LOCAL_CURRENCY = "PKR";
const PAYPAL_CURRENCY =
  process.env.PAYPAL_CURRENCY || "USD";

const getPkrToUsdRate = () => {
  const rate = Number(
    process.env.PAYPAL_PKR_TO_USD_RATE
  );

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(
      "PAYPAL_PKR_TO_USD_RATE is not configured correctly."
    );
  }

  return rate;
};

export const convertPkrToUsd = (pkrAmount) => {
  const amount = Number(pkrAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      "PKR amount must be greater than zero."
    );
  }

  const exchangeRate = getPkrToUsdRate();

  const usdAmount = amount * exchangeRate;

  if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
    throw new Error(
      "Unable to convert PKR amount to USD."
    );
  }

  return {
    sourceAmount: Number(amount.toFixed(2)),
    sourceCurrency: LOCAL_CURRENCY,

    convertedAmount: Number(
      usdAmount.toFixed(2)
    ),

    targetCurrency: PAYPAL_CURRENCY,

    exchangeRate,
  };
};

export const getPaypalCurrency = () => {
  return PAYPAL_CURRENCY.toUpperCase();
};