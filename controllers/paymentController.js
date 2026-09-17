import {
  createPayPalPayment,
  capturePayPalPayment,
  getPayPalPaymentStatus,
  cancelPendingPayment,
  handlePayPalWebhook,
} from "../services/paymentServices.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

export const createPayment = async (req, res, next) => {
  try {
    const {
      saleId,
      amount,
      currency,
      returnUrl,
      cancelUrl,
    } = req.body;

    const result = await createPayPalPayment({
      saleId,
      amount,
      currency,
      userId: req.user._id,
      returnUrl,
      cancelUrl,
    });

    return successResponse(
      res,
      201,
      "PayPal payment created successfully.",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const capturePayment = async (req, res, next) => {
  try {
    const result = await capturePayPalPayment({
      paymentId: req.params.id,
      userId: req.user._id,
    });

    if (result.success) {
      return successResponse(
        res,
        200,
        "Payment completed successfully.",
        result
      );
    }

    if (result.pending) {
      return successResponse(
        res,
        200,
        "Payment is still pending.",
        result
      );
    }

    return successResponse(
      res,
      200,
      "Payment was not completed.",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const getPaymentStatus = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await getPayPalPaymentStatus({
        paymentId: req.params.id,
      });

    return successResponse(
      res,
      200,
      "Payment status fetched successfully.",
      result
    );
  } catch (error) {
    next(error);
  }
};

export const cancelPayment = async (
  req,
  res,
  next
) => {
  try {
    const payment =
      await cancelPendingPayment({
        paymentId: req.params.id,
        userId: req.user._id,
      });

    return successResponse(
      res,
      200,
      "Payment cancelled successfully.",
      payment
    );
  } catch (error) {
    next(error);
  }
};

export const paypalWebhook = async (
  req,
  res
) => {
  try {
    await handlePayPalWebhook({
      headers: req.headers,
      rawBody: req.body,
    });

    return res.status(200).json({
      success: true,
      message: "Webhook received.",
    });
  } catch (error) {
    console.error(
      "PayPal webhook error:",
      error
    );

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};