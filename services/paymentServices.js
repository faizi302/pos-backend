import mongoose from "mongoose";

import Sale from "../models/Sale.js";
import SalePayment from "../models/salePayment.js";

import {
  createPayPalOrder,
  capturePayPalOrder,
  getPayPalOrder,
  verifyPayPalWebhook,
} from "../gateways/paypalGateway.js";

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

const buildTenantQuery = ({
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
}) => {
  if (isSuperAdmin) {
    return {};
  }

  return {
    tenantOwner,
    business,
    businessType,
  };
};

const updateSalePaymentTotals = async (
  saleId,
  scope,
  session = null
) => {
  const paymentQuery = SalePayment.find({
    sale: saleId,
    status: "completed",
    ...buildTenantQuery(scope),
  });

  if (session) {
    paymentQuery.session(session);
  }

  const payments = await paymentQuery;

  const paidAmount = payments.reduce(
    (total, payment) =>
      total + Number(payment.amount || 0),
    0
  );

  const saleQuery = Sale.findOne({
    _id: saleId,
    ...buildTenantQuery(scope),
  });

  if (session) {
    saleQuery.session(session);
  }

  const sale = await saleQuery;

  if (!sale) {
    throw new Error("Sale not found.");
  }

  const dueAmount = Math.max(
    Number(sale.totalAmount || 0) - paidAmount,
    0
  );

  sale.paidAmount = paidAmount;
  sale.dueAmount = dueAmount;

  sale.paymentStatus = calculateSalePaymentStatus({
    totalAmount: Number(sale.totalAmount || 0),
    paidAmount,
  });

  if (session) {
    await sale.save({ session });
  } else {
    await sale.save();
  }

  return sale;
};

export const createPayPalPayment = async ({
  saleId,
  amount,
  currency,
  userId,
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
  returnUrl,
  cancelUrl,
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

    const sale = await Sale.findOne({
      _id: saleId,
      ...buildTenantQuery(scope),
    }).session(session);

    if (!sale) {
      throw new Error("Sale not found.");
    }

    if (sale.status === "cancelled") {
      throw new Error(
        "Cancelled sale cannot receive payment."
      );
    }

    if (sale.status === "returned") {
      throw new Error(
        "Returned sale cannot receive payment."
      );
    }

    if (sale.paymentStatus === "paid") {
      throw new Error(
        "This sale is already fully paid."
      );
    }

    const requestedAmount = Number(amount);

    const dueAmount = Math.max(
      Number(sale.totalAmount || 0) -
        Number(sale.paidAmount || 0),
      0
    );

    if (requestedAmount <= 0) {
      throw new Error(
        "Payment amount must be greater than zero."
      );
    }

    if (requestedAmount > dueAmount) {
      throw new Error(
        `Payment amount cannot exceed the remaining due amount of ${dueAmount}.`
      );
    }

    const payment = await SalePayment.create(
      [
        {
          tenantOwner: sale.tenantOwner,
          business: sale.business,
          businessType: sale.businessType,

          sale: sale._id,
          customer: sale.customer || null,

          paymentNumber: `PAY-${Date.now()}`,

          amount: requestedAmount,

          currency: currency.toUpperCase(),

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

    const paypalOrder = await createPayPalOrder({
      paymentId: createdPayment._id,
      amount: requestedAmount,
      currency: currency.toUpperCase(),

      description: `POS payment for sale ${sale.saleNumber}`,

      returnUrl,
      cancelUrl,
    });

    createdPayment.gatewayOrderId =
      paypalOrder.orderId;

    createdPayment.gatewayStatus =
      paypalOrder.status;

    createdPayment.gatewayResponse =
      paypalOrder.response;

    await createdPayment.save({ session });

    await session.commitTransaction();

    return {
      payment: createdPayment,
      orderId: paypalOrder.orderId,
      approvalUrl: paypalOrder.approvalUrl,
      paypalStatus: paypalOrder.status,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const capturePayPalPayment = async ({
  paymentId,
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

    const payment = await SalePayment.findOne({
      _id: paymentId,
      ...buildTenantQuery(scope),
    }).session(session);

    if (!payment) {
      throw new Error("Payment not found.");
    }

    if (payment.gateway !== "paypal") {
      throw new Error(
        "This payment does not belong to PayPal."
      );
    }

    if (!payment.gatewayOrderId) {
      throw new Error(
        "PayPal order ID is missing."
      );
    }

    if (payment.status === "completed") {
      await session.commitTransaction();

      return {
        payment,
        alreadyCompleted: true,
      };
    }

    const captureResponse =
      await capturePayPalOrder(
        payment.gatewayOrderId
      );

    payment.gatewayStatus =
      captureResponse.status || "";

    payment.gatewayResponse =
      captureResponse;

    if (captureResponse.status === "COMPLETED") {
      const capture =
        captureResponse.purchase_units?.[0]
          ?.payments?.captures?.[0];

      payment.status = "completed";

      payment.paymentDate = new Date();

      payment.gatewayPaymentId =
        capture?.id || null;

      payment.transactionId =
        capture?.id || null;

      payment.updatedBy = userId;

      await payment.save({ session });

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
        success: true,
      };
    }

    if (captureResponse.status === "PENDING") {
      payment.status = "pending";

      await payment.save({ session });

      await session.commitTransaction();

      return {
        payment,
        success: false,
        pending: true,
      };
    }

    payment.status = "failed";
    payment.updatedBy = userId;

    await payment.save({ session });

    await session.commitTransaction();

    return {
      payment,
      success: false,
      pending: false,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

export const getPayPalPaymentStatus = async ({
  paymentId,
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
}) => {
  const payment = await SalePayment.findOne({
    _id: paymentId,
    ...buildTenantQuery({
      tenantOwner,
      business,
      businessType,
      isSuperAdmin,
    }),
  });

  if (!payment) {
    throw new Error("Payment not found.");
  }

  if (payment.gateway !== "paypal") {
    throw new Error(
      "This payment does not belong to PayPal."
    );
  }

  if (!payment.gatewayOrderId) {
    throw new Error(
      "PayPal order ID is missing."
    );
  }

  const paypalOrder = await getPayPalOrder(
    payment.gatewayOrderId
  );

  return {
    payment,
    paypalOrder,
  };
};

export const cancelPendingPayment = async ({
  paymentId,
  userId,
  tenantOwner,
  business,
  businessType,
  isSuperAdmin = false,
}) => {
  const payment = await SalePayment.findOne({
    _id: paymentId,
    ...buildTenantQuery({
      tenantOwner,
      business,
      businessType,
      isSuperAdmin,
    }),
  });

  if (!payment) {
    throw new Error("Payment not found.");
  }

  if (payment.status === "completed") {
    throw new Error(
      "Completed payment cannot be cancelled."
    );
  }

  if (
    !["pending", "failed"].includes(
      payment.status
    )
  ) {
    throw new Error(
      "This payment cannot be cancelled."
    );
  }

  payment.status = "cancelled";
  payment.updatedBy = userId;

  await payment.save();

  return payment;
};

export const handlePayPalWebhook = async ({
  headers,
  rawBody,
}) => {
  const {
    "paypal-transmission-id": transmissionId,
    "paypal-transmission-time": transmissionTime,
    "paypal-transmission-sig": transmissionSig,
    "paypal-cert-url": certUrl,
    "paypal-auth-algo": authAlgo,
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

  const webhookEvent =
    JSON.parse(rawBody.toString("utf8"));

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

  const eventType = webhookEvent.event_type;
  const resource = webhookEvent.resource;

  const orderId =
    resource?.supplementary_data?.related_ids
      ?.order_id ||
    resource?.id;

  if (!orderId) {
    return {
      processed: false,
      message:
        "Webhook received without a usable order ID.",
    };
  }

  const payment =
    await SalePayment.findOne({
      gateway: "paypal",
      gatewayOrderId: orderId,
    });

  if (!payment) {
    return {
      processed: false,
      message:
        "No matching local payment found.",
    };
  }

  const scope = {
    tenantOwner: payment.tenantOwner,
    business: payment.business,
    businessType: payment.businessType,
    isSuperAdmin: false,
  };

  if (
    eventType ===
    "PAYMENT.CAPTURE.COMPLETED"
  ) {
    if (payment.status !== "completed") {
      const captureId = resource?.id;

      payment.status = "completed";

      payment.gatewayStatus = "COMPLETED";

      payment.gatewayPaymentId =
        captureId || null;

      payment.transactionId =
        captureId || null;

      payment.paymentDate = new Date();

      payment.gatewayResponse =
        webhookEvent;

      await payment.save();

      await updateSalePaymentTotals(
        payment.sale,
        scope
      );
    }
  }

  if (
    eventType ===
    "PAYMENT.CAPTURE.PENDING"
  ) {
    if (payment.status !== "completed") {
      payment.status = "pending";

      payment.gatewayStatus = "PENDING";

      payment.gatewayResponse =
        webhookEvent;

      await payment.save();
    }
  }

  if (
    eventType ===
    "PAYMENT.CAPTURE.DENIED"
  ) {
    if (payment.status !== "completed") {
      payment.status = "failed";

      payment.gatewayStatus = "DENIED";

      payment.gatewayResponse =
        webhookEvent;

      await payment.save();
    }
  }

  if (
    eventType ===
    "CHECKOUT.PAYMENT-APPROVAL.REVERSED"
  ) {
    if (payment.status !== "completed") {
      payment.status = "failed";

      payment.gatewayStatus =
        "APPROVAL_REVERSED";

      payment.gatewayResponse =
        webhookEvent;

      await payment.save();
    }
  }

  return {
    processed: true,
    eventType,
    paymentId: payment._id,
  };
};