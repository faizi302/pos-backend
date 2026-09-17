import mongoose from "mongoose";

import SalePayment from "../models/salePayment.js";
import Sale from "../models/Sale.js";
import Customer from "../models/Customer.js";
import Business from "../models/Business.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

// ==================================================
// HELPER: CHECK SUPER ADMIN
// ==================================================

const isSuperAdmin = (req) => {
  return req.user?.role?.slug === "super-admin";
};

// ==================================================
// HELPER: GET BUSINESS ID
// ==================================================

const getBusinessId = (req) => {
  if (isSuperAdmin(req)) {
    return req.body.business || req.query.business;
  }

  return req.user?.business?._id || req.user?.business;
};

// ==================================================
// HELPER: VALIDATE BUSINESS
// ==================================================

const validateBusiness = async (businessId) => {
  if (!businessId) {
    return {
      valid: false,
      message: "Business is required.",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(businessId)) {
    return {
      valid: false,
      message: "Invalid business ID.",
    };
  }

  const business = await Business.findOne({
    _id: businessId,
    isActive: true,
  });

  if (!business) {
    return {
      valid: false,
      message: "Business not found or inactive.",
    };
  }

  return {
    valid: true,
    business,
  };
};

// ==================================================
// HELPER: GENERATE PAYMENT NUMBER
// ==================================================

const generatePaymentNumber = async (businessId) => {
  const lastPayment = await SalePayment.findOne({
    business: businessId,
  })
    .sort({ createdAt: -1 })
    .select("paymentNumber");

  if (!lastPayment) {
    return "PAY-000001";
  }

  const lastNumber = parseInt(
    lastPayment.paymentNumber.replace("PAY-", ""),
    10
  );

  const nextNumber = Number.isNaN(lastNumber)
    ? 1
    : lastNumber + 1;

  return `PAY-${String(nextNumber).padStart(6, "0")}`;
};

// ==================================================
// HELPER: RECALCULATE SALE PAYMENT STATUS
// ==================================================

const recalculateSalePaymentStatus = async (
  saleId,
  session = null
) => {
  const paymentsQuery = SalePayment.find({
    sale: saleId,
    status: "completed",
  }).select("amount");

  if (session) {
    paymentsQuery.session(session);
  }

  const payments = await paymentsQuery;

  const paidAmount = payments.reduce(
    (total, payment) => total + Number(payment.amount || 0),
    0
  );

  const saleQuery = Sale.findById(saleId);

  if (session) {
    saleQuery.session(session);
  }

  const sale = await saleQuery;

  if (!sale) {
    throw new Error("Sale not found.");
  }

  const totalAmount = Number(sale.totalAmount || 0);

  const dueAmount = Math.max(
    totalAmount - paidAmount,
    0
  );

  let paymentStatus = "unpaid";

  if (paidAmount <= 0) {
    paymentStatus = "unpaid";
  } else if (paidAmount < totalAmount) {
    paymentStatus = "partially_paid";
  } else {
    paymentStatus = "paid";
  }

  sale.paidAmount = paidAmount;
  sale.dueAmount = dueAmount;
  sale.paymentStatus = paymentStatus;

  if (session) {
    await sale.save({ session });
  } else {
    await sale.save();
  }

  return {
    paidAmount,
    dueAmount,
    paymentStatus,
  };
};

// ==================================================
// CREATE MANUAL SALE PAYMENT
// ==================================================

export const createSalePayment = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const businessId = getBusinessId(req);

    const businessCheck =
      await validateBusiness(businessId);

    if (!businessCheck.valid) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        businessCheck.message
      );
    }

    const {
      sale,
      customer,
      amount,
      currency = "PKR",
      paymentMethod = "cash",
      paymentDate,
      paymentNumber,
      referenceNumber = "",
      notes = "",
    } = req.body;

    // ------------------------------------------------
    // ONLY MANUAL PAYMENT METHODS
    // ------------------------------------------------

    const manualPaymentMethods = [
      "cash",
      "bank",
      "card",
      "cheque",
      "credit",
      "other",
    ];

    if (!manualPaymentMethods.includes(paymentMethod)) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Online gateway payments must be created through the payment gateway endpoint."
      );
    }

    // ------------------------------------------------
    // VALIDATE AMOUNT
    // ------------------------------------------------

    if (
      amount === undefined ||
      Number(amount) <= 0
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Payment amount must be greater than zero."
      );
    }

    // ------------------------------------------------
    // VALIDATE SALE
    // ------------------------------------------------

    const saleRecord = await Sale.findOne({
      _id: sale,
      business: businessId,
    }).session(session);

    if (!saleRecord) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    // ------------------------------------------------
    // SALE STATUS
    // ------------------------------------------------

    if (
      saleRecord.status === "cancelled" ||
      saleRecord.status === "returned"
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Payment cannot be added to a cancelled or returned sale."
      );
    }

    // ------------------------------------------------
    // VALIDATE CUSTOMER
    // ------------------------------------------------

    let customerRecord = null;

    if (customer) {
      customerRecord = await Customer.findOne({
        _id: customer,
        business: businessId,
        isActive: true,
      }).session(session);

      if (!customerRecord) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Customer not found or inactive."
        );
      }

      if (
        saleRecord.customer &&
        saleRecord.customer.toString() !==
          customer.toString()
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Customer does not belong to this sale."
        );
      }
    }

    // ------------------------------------------------
    // CALCULATE EXISTING PAID AMOUNT
    // ------------------------------------------------

    const existingPayments =
      await SalePayment.find({
        sale: saleRecord._id,
        status: "completed",
      })
        .session(session)
        .select("amount");

    const existingPaidAmount =
      existingPayments.reduce(
        (total, payment) =>
          total + Number(payment.amount || 0),
        0
      );

    const remainingAmount = Math.max(
      Number(saleRecord.totalAmount || 0) -
        existingPaidAmount,
      0
    );

    // ------------------------------------------------
    // PREVENT OVERPAYMENT
    // ------------------------------------------------

    if (Number(amount) > remainingAmount) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        `Payment amount cannot exceed remaining amount of ${remainingAmount}.`
      );
    }

    // ------------------------------------------------
    // GENERATE PAYMENT NUMBER
    // ------------------------------------------------

    let finalPaymentNumber = paymentNumber;

    if (!finalPaymentNumber) {
      finalPaymentNumber =
        await generatePaymentNumber(
          businessId
        );
    }

    // ------------------------------------------------
    // CHECK DUPLICATE PAYMENT NUMBER
    // ------------------------------------------------

    const existingPaymentNumber =
      await SalePayment.findOne({
        business: businessId,
        paymentNumber: finalPaymentNumber,
      }).session(session);

    if (existingPaymentNumber) {
      await session.abortTransaction();

      return errorResponse(
        res,
        409,
        "Payment number already exists."
      );
    }

    // ------------------------------------------------
    // CREATE MANUAL PAYMENT
    // ------------------------------------------------

    const [newPayment] =
      await SalePayment.create(
        [
          {
            business: businessId,

            sale: saleRecord._id,

            customer:
              customer ||
              saleRecord.customer ||
              null,

            paymentNumber:
              finalPaymentNumber,

            amount: Number(amount),

            currency:
              currency.toUpperCase(),

            paymentMethod,

            // Manual payment
            gateway: null,

            // Manual payment is considered
            // completed when recorded by authorized user.
            status: "completed",

            paymentDate:
              paymentDate || new Date(),

            referenceNumber,

            transactionId: "",

            gatewayOrderId: "",

            gatewayPaymentId: "",

            gatewayStatus: "",

            gatewayResponse: null,

            notes,

            createdBy: req.user._id,
          },
        ],
        { session }
      );

    // ------------------------------------------------
    // RECALCULATE SALE
    // ------------------------------------------------

    const paymentSummary =
      await recalculateSalePaymentStatus(
        saleRecord._id,
        session
      );

    await session.commitTransaction();

    // ------------------------------------------------
    // POPULATE RESPONSE
    // ------------------------------------------------

    const populatedPayment =
      await SalePayment.findById(
        newPayment._id
      )
        .populate(
          "sale",
          "saleNumber totalAmount paidAmount dueAmount paymentStatus"
        )
        .populate(
          "customer",
          "name phone"
        )
        .populate(
          "createdBy",
          "name email"
        );

    return successResponse(
      res,
      201,
      "Sale payment created successfully.",
      {
        payment: populatedPayment,
        salePaymentSummary:
          paymentSummary,
      }
    );
  } catch (error) {
    await session.abortTransaction();

    console.error(
      "Create Sale Payment Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to create sale payment.",
      error.message
    );
  } finally {
    await session.endSession();
  }
};

// ==================================================
// GET ALL SALE PAYMENTS
// ==================================================

export const getAllSalePayments = async (
  req,
  res
) => {
  try {
    const businessId = getBusinessId(req);

    const businessCheck =
      await validateBusiness(businessId);

    if (!businessCheck.valid) {
      return errorResponse(
        res,
        400,
        businessCheck.message
      );
    }

    const {
      page = 1,
      limit = 20,
      sale,
      customer,
      status,
      paymentMethod,
      gateway,
      currency,
      search,
      startDate,
      endDate,
    } = req.query;

    const pageNumber = Math.max(
      Number(page),
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip =
      (pageNumber - 1) *
      limitNumber;

    const filter = {
      business: businessId,
    };

    if (sale) {
      filter.sale = sale;
    }

    if (customer) {
      filter.customer = customer;
    }

    if (status) {
      filter.status = status;
    }

    if (paymentMethod) {
      filter.paymentMethod =
        paymentMethod;
    }

    if (gateway) {
      filter.gateway = gateway;
    }

    if (currency) {
      filter.currency =
        currency.toUpperCase();
    }

    if (search) {
      filter.$or = [
        {
          paymentNumber: {
            $regex: search,
            $options: "i",
          },
        },
        {
          referenceNumber: {
            $regex: search,
            $options: "i",
          },
        },
        {
          transactionId: {
            $regex: search,
            $options: "i",
          },
        },
        {
          gatewayOrderId: {
            $regex: search,
            $options: "i",
          },
        },
        {
          gatewayPaymentId: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    if (startDate || endDate) {
      filter.paymentDate = {};

      if (startDate) {
        filter.paymentDate.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const end = new Date(endDate);

        end.setHours(
          23,
          59,
          59,
          999
        );

        filter.paymentDate.$lte = end;
      }
    }

    const [payments, total] =
      await Promise.all([
        SalePayment.find(filter)
          .populate(
            "sale",
            "saleNumber totalAmount paidAmount dueAmount paymentStatus"
          )
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          )
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limitNumber),

        SalePayment.countDocuments(
          filter
        ),
      ]);

    return successResponse(
      res,
      200,
      "Sale payments fetched successfully.",
      {
        payments,

        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages:
            Math.ceil(
              total /
                limitNumber
            ),
        },
      }
    );
  } catch (error) {
    console.error(
      "Get Sale Payments Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sale payments.",
      error.message
    );
  }
};

// ==================================================
// GET SALE PAYMENTS BY SALE
// ==================================================

export const getSalePaymentsBySale =
  async (req, res) => {
    try {
      const businessId =
        getBusinessId(req);

      const { saleId } =
        req.params;

      const businessCheck =
        await validateBusiness(
          businessId
        );

      if (!businessCheck.valid) {
        return errorResponse(
          res,
          400,
          businessCheck.message
        );
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          saleId
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid sale ID."
        );
      }

      const saleRecord =
        await Sale.findOne({
          _id: saleId,
          business: businessId,
        });

      if (!saleRecord) {
        return errorResponse(
          res,
          404,
          "Sale not found."
        );
      }

      const payments =
        await SalePayment.find({
          business: businessId,
          sale: saleId,
        })
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          )
          .sort({
            createdAt: -1,
          });

      return successResponse(
        res,
        200,
        "Sale payments fetched successfully.",
        {
          sale: {
            _id: saleRecord._id,

            saleNumber:
              saleRecord.saleNumber,

            totalAmount:
              saleRecord.totalAmount,

            paidAmount:
              saleRecord.paidAmount,

            dueAmount:
              saleRecord.dueAmount,

            paymentStatus:
              saleRecord.paymentStatus,
          },

          payments,
        }
      );
    } catch (error) {
      console.error(
        "Get Sale Payments By Sale Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to fetch sale payments.",
        error.message
      );
    }
  };

// ==================================================
// GET SALE PAYMENT BY ID
// ==================================================

export const getSalePaymentById =
  async (req, res) => {
    try {
      const businessId =
        getBusinessId(req);

      const { id } =
        req.params;

      const businessCheck =
        await validateBusiness(
          businessId
        );

      if (!businessCheck.valid) {
        return errorResponse(
          res,
          400,
          businessCheck.message
        );
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid payment ID."
        );
      }

      const payment =
        await SalePayment.findOne({
          _id: id,
          business: businessId,
        })
          .populate(
            "sale",
            "saleNumber totalAmount paidAmount dueAmount paymentStatus"
          )
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          );

      if (!payment) {
        return errorResponse(
          res,
          404,
          "Sale payment not found."
        );
      }

      return successResponse(
        res,
        200,
        "Sale payment fetched successfully.",
        payment
      );
    } catch (error) {
      console.error(
        "Get Sale Payment Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to fetch sale payment.",
        error.message
      );
    }
  };

// ==================================================
// UPDATE MANUAL SALE PAYMENT
// ==================================================

export const updateSalePayment =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      const businessId =
        getBusinessId(req);

      const { id } =
        req.params;

      const businessCheck =
        await validateBusiness(
          businessId
        );

      if (!businessCheck.valid) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          businessCheck.message
        );
      }

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Invalid payment ID."
        );
      }

      const payment =
        await SalePayment.findOne({
          _id: id,
          business: businessId,
        }).session(session);

      if (!payment) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale payment not found."
        );
      }

      // ------------------------------------------------
      // ONLINE PAYMENTS ARE NOT EDITED HERE
      // ------------------------------------------------

      if (
        payment.gateway === "paypal" ||
        payment.gateway ===
          "easypaisa" ||
        payment.gateway ===
          "jazzcash" ||
        payment.gateway ===
          "stripe"
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Gateway payments cannot be manually updated. Use the payment gateway flow."
        );
      }

      // ------------------------------------------------
      // GET PARENT SALE
      // ------------------------------------------------

      const saleRecord =
        await Sale.findOne({
          _id: payment.sale,
          business: businessId,
        }).session(session);

      if (!saleRecord) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale not found."
        );
      }

      if (
        saleRecord.status ===
          "cancelled" ||
        saleRecord.status ===
          "returned"
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Payment cannot be updated for a cancelled or returned sale."
        );
      }

      const {
        paymentDate,
        amount,
        paymentMethod,
        referenceNumber,
        notes,
      } = req.body;

      // ------------------------------------------------
      // MANUAL PAYMENT METHODS ONLY
      // ------------------------------------------------

      const manualPaymentMethods = [
        "cash",
        "bank",
        "card",
        "cheque",
        "credit",
        "other",
      ];

      if (
        paymentMethod !== undefined &&
        !manualPaymentMethods.includes(
          paymentMethod
        )
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Gateway payment methods cannot be updated through this endpoint."
        );
      }

      // ------------------------------------------------
      // PREVENT OVERPAYMENT
      // ------------------------------------------------

      if (
        amount !== undefined &&
        Number(amount) !==
          Number(payment.amount)
      ) {
        const otherPayments =
          await SalePayment.find({
            sale: payment.sale,

            _id: {
              $ne: payment._id,
            },

            status: "completed",
          })
            .session(session)
            .select("amount");

        const otherPaidAmount =
          otherPayments.reduce(
            (total, item) =>
              total +
              Number(
                item.amount || 0
              ),
            0
          );

        if (
          otherPaidAmount +
            Number(amount) >
          Number(
            saleRecord.totalAmount
          )
        ) {
          await session.abortTransaction();

          return errorResponse(
            res,
            400,
            "Updated payment would exceed the sale total."
          );
        }
      }

      // ------------------------------------------------
      // UPDATE MANUAL FIELDS
      // ------------------------------------------------

      if (
        paymentDate !== undefined
      ) {
        payment.paymentDate =
          paymentDate;
      }

      if (
        amount !== undefined
      ) {
        if (Number(amount) <= 0) {
          await session.abortTransaction();

          return errorResponse(
            res,
            400,
            "Payment amount must be greater than zero."
          );
        }

        payment.amount =
          Number(amount);
      }

      if (
        paymentMethod !==
        undefined
      ) {
        payment.paymentMethod =
          paymentMethod;
      }

      if (
        referenceNumber !==
        undefined
      ) {
        payment.referenceNumber =
          referenceNumber;
      }

      if (
        notes !== undefined
      ) {
        payment.notes = notes;
      }

      payment.updatedBy =
        req.user._id;

      await payment.save({
        session,
      });

      // ------------------------------------------------
      // RECALCULATE SALE
      // ------------------------------------------------

      const paymentSummary =
        await recalculateSalePaymentStatus(
          saleRecord._id,
          session
        );

      await session.commitTransaction();

      const updatedPayment =
        await SalePayment.findById(
          payment._id
        )
          .populate(
            "sale",
            "saleNumber totalAmount paidAmount dueAmount paymentStatus"
          )
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "updatedBy",
            "name email"
          );

      return successResponse(
        res,
        200,
        "Sale payment updated successfully.",
        {
          payment:
            updatedPayment,

          salePaymentSummary:
            paymentSummary,
        }
      );
    } catch (error) {
      await session.abortTransaction();

      console.error(
        "Update Sale Payment Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to update sale payment.",
        error.message
      );
    } finally {
      await session.endSession();
    }
  };

// ==================================================
// CANCEL SALE PAYMENT
// ==================================================

export const cancelSalePayment =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      const businessId =
        getBusinessId(req);

      const { id } =
        req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          id
        )
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Invalid payment ID."
        );
      }

      const payment =
        await SalePayment.findOne({
          _id: id,
          business: businessId,
        }).session(session);

      if (!payment) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale payment not found."
        );
      }

      // ------------------------------------------------
      // GATEWAY PAYMENTS
      // ------------------------------------------------

      if (payment.gateway) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Gateway payments cannot be cancelled through the manual SalePayment endpoint."
        );
      }

      if (
        payment.status ===
        "cancelled"
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Payment is already cancelled."
        );
      }

      payment.status =
        "cancelled";

      payment.updatedBy =
        req.user._id;

      await payment.save({
        session,
      });

      const paymentSummary =
        await recalculateSalePaymentStatus(
          payment.sale,
          session
        );

      await session.commitTransaction();

      return successResponse(
        res,
        200,
        "Sale payment cancelled successfully.",
        {
          payment,
          salePaymentSummary:
            paymentSummary,
        }
      );
    } catch (error) {
      await session.abortTransaction();

      console.error(
        "Cancel Sale Payment Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to cancel sale payment.",
        error.message
      );
    } finally {
      await session.endSession();
    }
  };

// ==================================================
// DELETE SALE PAYMENT
// ==================================================

export const deleteSalePayment =
  async (req, res) => {
    return errorResponse(
      res,
      400,
      "Sale payments should not be permanently deleted. Cancel or refund the payment instead."
    );
  };