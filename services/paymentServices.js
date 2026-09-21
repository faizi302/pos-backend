import mongoose from "mongoose";

import Sale from "../models/Sale.js";
import SalePayment from "../models/salePayment.js";

import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  verifyPayPalWebhook,
} from "../gateways/paypalGateway.js";

import {
  convertPkrToUsd,
  getPaypalCurrency,
} from "../utils/currency.js";

// =====================================================
// HELPERS
// =====================================================

const calculateSalePaymentStatus = ({
  totalAmount,
  paidAmount,
}) => {
  if (paidAmount <= 0) {
    return "unpaid";
  }

  if (paidAmount < totalAmount) {
    return "partially_paid";
  }

  return "paid";
};

// =====================================================
// TENANT QUERY
// =====================================================

const buildTenantQuery = ({
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
}) => {
  if (isSuperAdmin) {
    return {};
  }

  if (
    !tenantOwner ||
    !business ||
    !businessType
  ) {
    throw new Error(
      "Tenant context is required."
    );
  }

  return {
    tenantOwner,
    business,
    businessType,
  };
};

// =====================================================
// UPDATE SALE PAYMENT TOTALS
// =====================================================
// IMPORTANT:
// SalePayment.amount is always LOCAL POS currency.
//
// Therefore Sale.paidAmount and Sale.dueAmount
// always remain PKR.
// =====================================================

const updateSalePaymentTotals = async (
  saleId,
  scope,
  session = null
) => {
  const tenantQuery =
    buildTenantQuery(scope);

  const paymentQuery = SalePayment.find({
    sale: saleId,

    status: "completed",

    ...tenantQuery,
  });

  if (session) {
    paymentQuery.session(session);
  }

  const payments = await paymentQuery;

  const paidAmount =
    payments.reduce(
      (total, payment) =>
        total +
        Number(payment.amount || 0),
      0
    );

  const saleQuery = Sale.findOne({
    _id: saleId,

    ...tenantQuery,
  });

  if (session) {
    saleQuery.session(session);
  }

  const sale = await saleQuery;

  if (!sale) {
    throw new Error("Sale not found.");
  }

  const totalAmount =
    Number(sale.totalAmount || 0);

  const dueAmount = Math.max(
    totalAmount - paidAmount,
    0
  );

  sale.paidAmount = paidAmount;

  sale.dueAmount = dueAmount;

  sale.paymentStatus =
    calculateSalePaymentStatus({
      totalAmount,
      paidAmount,
    });

  if (session) {
    await sale.save({ session });
  } else {
    await sale.save();
  }

  return sale;
};

// =====================================================
// CREATE PAYPAL PAYMENT
// =====================================================

export const createPayPalPayment = async ({
  saleId,
  userId,
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
}) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const scope = {
      tenantOwner,
      business,
      businessType,
      isSuperAdmin,
    };

    const tenantQuery = buildTenantQuery(scope);

    // -------------------------------------------------
    // FIND SALE
    // -------------------------------------------------
    const sale = await Sale.findOne({
      _id: saleId,
      ...tenantQuery,
    }).session(session);

    if (!sale) {
      throw new Error("Sale not found.");
    }

    // -------------------------------------------------
    // SALE STATUS
    // -------------------------------------------------
    if (["cancelled", "returned"].includes(sale.status)) {
      throw new Error("This sale cannot receive payment.");
    }

    if (sale.paymentStatus === "paid") {
      throw new Error("This sale is already fully paid.");
    }

    // -------------------------------------------------
    // CALCULATE CURRENT DUE AMOUNT
    // -------------------------------------------------
    const totalAmount = Number(sale.totalAmount || 0);
    const paidAmount = Number(sale.paidAmount || 0);
    const dueAmount = Math.max(totalAmount - paidAmount, 0);

    if (dueAmount <= 0) {
      throw new Error("This sale has no remaining balance.");
    }

    // -------------------------------------------------
    // AMOUNT = full remaining due amount
    // Frontend no longer sends amount.
    // -------------------------------------------------
    const requestedAmount = dueAmount;

    // -------------------------------------------------
    // RETURN / CANCEL URLS FROM ENVIRONMENT
    // -------------------------------------------------
    const returnUrl = process.env.PAYPAL_RETURN_URL;
    const cancelUrl = process.env.PAYPAL_CANCEL_URL;

    if (!returnUrl || !cancelUrl) {
      throw new Error(
        "PAYPAL_RETURN_URL and PAYPAL_CANCEL_URL must be configured in environment."
      );
    }

    // -------------------------------------------------
    // PKR -> USD
    // -------------------------------------------------
    const conversion = convertPkrToUsd(requestedAmount);

    const gatewayAmount = conversion.convertedAmount;
    const gatewayCurrency = conversion.targetCurrency;
    const exchangeRate = conversion.exchangeRate;

    // -------------------------------------------------
    // CREATE LOCAL PAYMENT
    // -------------------------------------------------
    const payment = await SalePayment.create(
      [
        {
          tenantOwner: sale.tenantOwner,
          business: sale.business,
          businessType: sale.businessType,
          sale: sale._id,
          customer: sale.customer || null,

          paymentNumber: `PAY-${Date.now()}-${Math.floor(
            Math.random() * 1000
          )}`,

          // LOCAL POS ACCOUNTING (always PKR)
          amount: Number(requestedAmount.toFixed(2)),
          currency: "PKR",

          // PAYPAL
          gatewayAmount,
          gatewayCurrency,
          exchangeRate,

          paymentMethod: "online",
          gateway: "paypal",
          status: "pending",
          paymentDate: null,

          createdBy: userId,
        },
      ],
      { session }
    );

    const createdPayment = payment[0];

    // -------------------------------------------------
    // CREATE PAYPAL ORDER
    // -------------------------------------------------
    const paypalOrder = await createPayPalOrder({
      paymentId: createdPayment._id,
      amount: gatewayAmount,
      currency: gatewayCurrency,
      description: `POS payment for sale ${sale.saleNumber}`,
      returnUrl,
      cancelUrl,
    });

    // -------------------------------------------------
    // SAVE PAYPAL DATA
    // -------------------------------------------------
    createdPayment.gatewayOrderId = paypalOrder.orderId;
    createdPayment.gatewayStatus = paypalOrder.status;
    createdPayment.gatewayResponse = paypalOrder.response;

    await createdPayment.save({ session });

    await session.commitTransaction();

    return {
      payment: createdPayment,
      orderId: paypalOrder.orderId,
      approvalUrl: paypalOrder.approvalUrl,
      paypalStatus: paypalOrder.status,
      localAmount: requestedAmount,
      localCurrency: "PKR",
      gatewayAmount,
      gatewayCurrency,
      exchangeRate,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

// =====================================================
// CAPTURE PAYPAL PAYMENT
// =====================================================

export const capturePayPalPayment = async ({
  paymentId,
  userId,
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
}) => {
  const session =
    await mongoose.startSession();

  try {
    session.startTransaction();

    const scope = {
      tenantOwner,
      business,
      businessType,
      isSuperAdmin,
    };

    const tenantQuery =
      buildTenantQuery(scope);

    // -------------------------------------------------
    // FIND PAYMENT WITH TENANT ISOLATION
    // -------------------------------------------------

    const payment =
      await SalePayment.findOne({
        _id: paymentId,

        ...tenantQuery,
      }).session(session);

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    if (
      payment.gateway !==
      "paypal"
    ) {
      throw new Error(
        "This payment does not belong to PayPal."
      );
    }

    if (
      !payment.gatewayOrderId
    ) {
      throw new Error(
        "PayPal order ID is missing."
      );
    }

    if (
      payment.status ===
      "completed"
    ) {
      await session.commitTransaction();

      return {
        payment,

        alreadyCompleted:
          true,

        success:
          true,
      };
    }

    // -------------------------------------------------
    // CAPTURE
    // -------------------------------------------------

    const captureResponse =
      await capturePayPalOrder(
        payment.gatewayOrderId
      );

    payment.gatewayStatus =
      captureResponse.status || "";

    payment.gatewayResponse =
      captureResponse;

    // -------------------------------------------------
    // PAYPAL COMPLETED
    // -------------------------------------------------

    if (
      captureResponse.status ===
      "COMPLETED"
    ) {
      const capture =
        captureResponse
          .purchase_units?.[0]
          ?.payments?.captures?.[0];

      if (!capture) {
        throw new Error(
          "PayPal capture information is missing."
        );
      }

      const capturedAmount =
        Number(
          capture.amount?.value
        );

      const capturedCurrency =
        capture.amount?.currency_code;

      const expectedAmount =
        Number(
          payment.gatewayAmount
        );

      const expectedCurrency =
        payment.gatewayCurrency;

      // -------------------------------------------------
      // VERIFY GATEWAY AMOUNT
      // -------------------------------------------------

      if (
        !Number.isFinite(
          capturedAmount
        ) ||
        capturedAmount !==
          Number(
            expectedAmount.toFixed(2)
          )
      ) {
        throw new Error(
          "PayPal captured amount does not match the local payment amount."
        );
      }

      // -------------------------------------------------
      // VERIFY GATEWAY CURRENCY
      // -------------------------------------------------

      if (
        capturedCurrency !==
        expectedCurrency
      ) {
        throw new Error(
          "PayPal captured currency does not match the local payment currency."
        );
      }

      // -------------------------------------------------
      // COMPLETE LOCAL PAYMENT
      // -------------------------------------------------

      payment.status =
        "completed";

      payment.paymentDate =
        new Date();

      payment.gatewayPaymentId =
        capture.id || null;

      payment.transactionId =
        capture.id || null;

      payment.updatedBy =
        userId;

      await payment.save({
        session,
      });

      // -------------------------------------------------
      // UPDATE SALE IN PKR
      // -------------------------------------------------

      const sale =
        await updateSalePaymentTotals(
          payment.sale,

          scope,

          session
        );

      await session.commitTransaction();

      return {
        payment,

        sale,

        success:
          true,

        localAmount:
          payment.amount,

        localCurrency:
          payment.currency,

        gatewayAmount:
          payment.gatewayAmount,

        gatewayCurrency:
          payment.gatewayCurrency,
      };
    }

    // -------------------------------------------------
    // PAYPAL PENDING
    // -------------------------------------------------

    if (
      captureResponse.status ===
      "PENDING"
    ) {
      payment.status =
        "pending";

      await payment.save({
        session,
      });

      await session.commitTransaction();

      return {
        payment,

        success:
          false,

        pending:
          true,
      };
    }

    // -------------------------------------------------
    // FAILED
    // -------------------------------------------------

    payment.status =
      "failed";

    payment.updatedBy =
      userId;

    await payment.save({
      session,
    });

    await session.commitTransaction();

    return {
      payment,

      success:
        false,

      pending:
        false,
    };
  } catch (error) {
    await session.abortTransaction();

    throw error;
  } finally {
    await session.endSession();
  }
};

// =====================================================
// GET PAYPAL PAYMENT STATUS
// =====================================================

export const getPayPalPaymentStatus =
  async ({
    paymentId,
    tenantOwner,
    business,
    businessType,
    isSuperAdmin = false,
  }) => {
    const payment =
      await SalePayment.findOne({
        _id: paymentId,

        ...buildTenantQuery({
          tenantOwner,
          business,
          businessType,
          isSuperAdmin,
        }),
      });

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    if (
      payment.gateway !==
      "paypal"
    ) {
      throw new Error(
        "This payment does not belong to PayPal."
      );
    }

    if (
      !payment.gatewayOrderId
    ) {
      throw new Error(
        "PayPal order ID is missing."
      );
    }

    const paypalOrder =
      await getPayPalOrder(
        payment.gatewayOrderId
      );

    return {
      payment,

      paypalOrder,

      localAmount:
        payment.amount,

      localCurrency:
        payment.currency,

      gatewayAmount:
        payment.gatewayAmount,

      gatewayCurrency:
        payment.gatewayCurrency,

      exchangeRate:
        payment.exchangeRate,
    };
  };

// =====================================================
// CANCEL PENDING PAYMENT
// =====================================================

export const cancelPendingPayment =
  async ({
    paymentId,
    userId,
    tenantOwner,
    business,
    businessType,
    isSuperAdmin = false,
  }) => {
    const payment =
      await SalePayment.findOne({
        _id: paymentId,

        ...buildTenantQuery({
          tenantOwner,
          business,
          businessType,
          isSuperAdmin,
        }),
      });

    if (!payment) {
      throw new Error(
        "Payment not found."
      );
    }

    if (
      payment.gateway !==
      "paypal"
    ) {
      throw new Error(
        "This payment does not belong to PayPal."
      );
    }

    if (
      payment.status ===
      "completed"
    ) {
      throw new Error(
        "Completed payment cannot be cancelled."
      );
    }

    if (
      ![
        "pending",
        "failed",
      ].includes(
        payment.status
      )
    ) {
      throw new Error(
        "This payment cannot be cancelled."
      );
    }

    payment.status =
      "cancelled";

    payment.updatedBy =
      userId;

    await payment.save();

    return payment;
  };

// =====================================================
// PAYPAL WEBHOOK
// =====================================================

export const handlePayPalWebhook =
  async ({
    headers,
    rawBody,
  }) => {
    const {
      "paypal-transmission-id":
        transmissionId,

      "paypal-transmission-time":
        transmissionTime,

      "paypal-transmission-sig":
        transmissionSig,

      "paypal-cert-url":
        certUrl,

      "paypal-auth-algo":
        authAlgo,
    } = headers;

    if (
      !transmissionId ||
      !transmissionTime ||
      !transmissionSig ||
      !certUrl ||
      !authAlgo
    ) {
      throw new Error(
        "Missing PayPal webhook verification headers."
      );
    }

    if (!rawBody) {
      throw new Error(
        "PayPal webhook raw body is required."
      );
    }

    const webhookEvent =
      Buffer.isBuffer(rawBody)
        ? JSON.parse(
            rawBody.toString("utf8")
          )
        : typeof rawBody ===
            "string"
          ? JSON.parse(rawBody)
          : rawBody;

    // -------------------------------------------------
    // VERIFY WEBHOOK
    // -------------------------------------------------

    const verification =
      await verifyPayPalWebhook({
        transmissionId,

        transmissionTime,

        transmissionSig,

        certUrl,

        authAlgo,

        webhookEvent,
      });

    if (
      verification.verification_status !==
      "SUCCESS"
    ) {
      throw new Error(
        "Invalid PayPal webhook signature."
      );
    }

    const eventType =
      webhookEvent.event_type;

    const resource =
      webhookEvent.resource;

    const orderId =
      resource
        ?.supplementary_data
        ?.related_ids
        ?.order_id ||
      resource?.id;

    if (!orderId) {
      return {
        processed:
          false,

        message:
          "Webhook received without a usable order ID.",
      };
    }

    // -------------------------------------------------
    // FIND LOCAL PAYMENT
    // -------------------------------------------------

    const payment =
      await SalePayment.findOne({
        gateway:
          "paypal",

        gatewayOrderId:
          orderId,
      });

    if (!payment) {
      return {
        processed:
          false,

        message:
          "No matching local payment found.",
      };
    }

    const scope = {
      tenantOwner:
        payment.tenantOwner,

      business:
        payment.business,

      businessType:
        payment.businessType,

      isSuperAdmin:
        false,
    };

    // -------------------------------------------------
    // COMPLETED
    // -------------------------------------------------

    if (
      eventType ===
      "PAYMENT.CAPTURE.COMPLETED"
    ) {
      if (
        payment.status !==
        "completed"
      ) {
        const captureId =
          resource?.id;

        const capturedAmount =
          Number(
            resource
              ?.amount?.value
          );

        const capturedCurrency =
          resource
            ?.amount
            ?.currency_code;

        const expectedAmount =
          Number(
            payment.gatewayAmount
          );

        const expectedCurrency =
          payment.gatewayCurrency;

        // ---------------------------------------------
        // VERIFY AMOUNT
        // ---------------------------------------------

        if (
          !Number.isFinite(
            capturedAmount
          ) ||
          capturedAmount !==
            Number(
              expectedAmount.toFixed(
                2
              )
            )
        ) {
          payment.status =
            "failed";

          payment.gatewayStatus =
            "AMOUNT_MISMATCH";

          payment.gatewayResponse =
            webhookEvent;

          await payment.save();

          throw new Error(
            "PayPal webhook amount does not match the local payment."
          );
        }

        // ---------------------------------------------
        // VERIFY CURRENCY
        // ---------------------------------------------

        if (
          capturedCurrency !==
          expectedCurrency
        ) {
          payment.status =
            "failed";

          payment.gatewayStatus =
            "CURRENCY_MISMATCH";

          payment.gatewayResponse =
            webhookEvent;

          await payment.save();

          throw new Error(
            "PayPal webhook currency does not match the local payment."
          );
        }

        // ---------------------------------------------
        // COMPLETE PAYMENT
        // ---------------------------------------------

        payment.status =
          "completed";

        payment.gatewayStatus =
          "COMPLETED";

        payment.gatewayPaymentId =
          captureId || null;

        payment.transactionId =
          captureId || null;

        payment.paymentDate =
          new Date();

        payment.gatewayResponse =
          webhookEvent;

        await payment.save();

        // ---------------------------------------------
        // UPDATE SALE USING PKR AMOUNT
        // ---------------------------------------------

        await updateSalePaymentTotals(
          payment.sale,

          scope
        );
      }
    }

    // -------------------------------------------------
    // PENDING
    // -------------------------------------------------

    if (
      eventType ===
      "PAYMENT.CAPTURE.PENDING"
    ) {
      if (
        payment.status !==
        "completed"
      ) {
        payment.status =
          "pending";

        payment.gatewayStatus =
          "PENDING";

        payment.gatewayResponse =
          webhookEvent;

        await payment.save();
      }
    }

    // -------------------------------------------------
    // DENIED
    // -------------------------------------------------

    if (
      eventType ===
      "PAYMENT.CAPTURE.DENIED"
    ) {
      if (
        payment.status !==
        "completed"
      ) {
        payment.status =
          "failed";

        payment.gatewayStatus =
          "DENIED";

        payment.gatewayResponse =
          webhookEvent;

        await payment.save();
      }
    }

    // -------------------------------------------------
    // REVERSED
    // -------------------------------------------------

    if (
      eventType ===
      "CHECKOUT.PAYMENT-APPROVAL.REVERSED"
    ) {
      if (
        payment.status !==
        "completed"
      ) {
        payment.status =
          "failed";

        payment.gatewayStatus =
          "APPROVAL_REVERSED";

        payment.gatewayResponse =
          webhookEvent;

        await payment.save();
      }
    }

    return {
      processed:
        true,

      eventType,

      paymentId:
        payment._id,
    };
  };