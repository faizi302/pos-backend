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

import {
  getTenantContext,
} from "../utils/tenantContext.js";

// =====================================================
// CREATE PAYPAL PAYMENT
// =====================================================

export const createPayment = async (req, res, next) => {
  try {
    const { saleId } = req.body;

    if (!saleId) {
      return errorResponse(res, 400, "saleId is required.");
    }

    // -------------------------------------------------
    // RESOLVE TENANT FROM AUTHENTICATED USER
    // -------------------------------------------------
    const tenant = await getTenantContext(req);

    // -------------------------------------------------
    // CREATE PAYMENT
    // Backend decides:
    // - amount          → from Sale.dueAmount
    // - returnUrl       → from process.env.PAYPAL_RETURN_URL
    // - cancelUrl       → from process.env.PAYPAL_CANCEL_URL
    // -------------------------------------------------
    const result = await createPayPalPayment({
      saleId,
      userId: req.user._id,
      tenantOwner: tenant.tenantOwner,
      business: tenant.business,
      businessType: tenant.businessType,
      isSuperAdmin: tenant.isSuperAdmin,
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

// =====================================================
// CAPTURE PAYMENT
// =====================================================

export const capturePayment = async (
  req,
  res,
  next
) => {
  try {
    const tenant =
      await getTenantContext(req);

    const result =
      await capturePayPalPayment({
        paymentId:
          req.params.id,

        userId:
          req.user._id,

        tenantOwner:
          tenant.tenantOwner,

        business:
          tenant.business,

        businessType:
          tenant.businessType,

        isSuperAdmin:
          tenant.isSuperAdmin,
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

// =====================================================
// GET PAYMENT STATUS
// =====================================================

export const getPaymentStatus =
  async (req, res, next) => {
    try {
      const tenant =
        await getTenantContext(req);

      const result =
        await getPayPalPaymentStatus({
          paymentId:
            req.params.id,

          tenantOwner:
            tenant.tenantOwner,

          business:
            tenant.business,

          businessType:
            tenant.businessType,

          isSuperAdmin:
            tenant.isSuperAdmin,
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

// =====================================================
// CANCEL PAYMENT
// =====================================================

export const cancelPayment = async (
  req,
  res,
  next
) => {
  try {
    const tenant =
      await getTenantContext(req);

    const payment =
      await cancelPendingPayment({
        paymentId:
          req.params.id,

        userId:
          req.user._id,

        tenantOwner:
          tenant.tenantOwner,

        business:
          tenant.business,

        businessType:
          tenant.businessType,

        isSuperAdmin:
          tenant.isSuperAdmin,
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

// =====================================================
// PAYPAL WEBHOOK
// =====================================================
// IMPORTANT:
// Do NOT use authenticated tenant middleware here.
//
// PayPal calls this endpoint directly.
// The payment itself determines the tenant after
// webhook verification.
// =====================================================

export const paypalWebhook = async (
  req,
  res
) => {
  try {
    await handlePayPalWebhook({
      headers:
        req.headers,

      rawBody:
        req.body,
    });

    return res.status(200).json({
      success:
        true,

      message:
        "Webhook received.",
    });
  } catch (error) {
    console.error(
      "PayPal webhook error:",
      error
    );

    return res.status(400).json({
      success:
        false,

      message:
        error.message,
    });
  }
};