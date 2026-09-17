import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import Supplier from "../models/Supplier.js";
import Business from "../models/Business.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

const getUserRole = (req) => {
  return req.user?.role?.slug || req.user?.role?.name || "";
};

const isSuperAdmin = (req) => {
  return getUserRole(req) === "super-admin";
};

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/*
 * Get business ID according to the logged-in user.
 *
 * SuperAdmin:
 * - can provide business in body/query
 *
 * Admin / Manager:
 * - business always comes from req.user.business
 * - never trust business from frontend
 */
const getBusinessId = (req, allowBody = true) => {
  if (isSuperAdmin(req)) {
    if (allowBody && req.body?.business) {
      return req.body.business;
    }

    if (req.query?.business) {
      return req.query.business;
    }

    return null;
  }

  return req.user?.business?._id || req.user?.business || null;
};

/*
 * Validate that business exists and is active.
 */
const validateBusiness = async (businessId) => {
  if (!businessId || !isValidObjectId(businessId)) {
    return null;
  }

  return await Business.findOne({
    _id: businessId,
    isActive: true,
  });
};

/*
 * Generate purchase number.
 *
 * Example:
 * PUR-000001
 * PUR-000002
 *
 * Numbering is maintained separately for each business.
 */
const generatePurchaseNumber = async (businessId) => {
  const lastPurchase = await Purchase.findOne({
    business: businessId,
  })
    .sort({ createdAt: -1 })
    .select("purchaseNumber");

  let nextNumber = 1;

  if (lastPurchase?.purchaseNumber) {
    const match = lastPurchase.purchaseNumber.match(
      /^PUR-(\d+)$/
    );

    if (match) {
      nextNumber = Number(match[1]) + 1;
    }
  }

  return `PUR-${String(nextNumber).padStart(6, "0")}`;
};

/*
 * CREATE PURCHASE
 */
export const createPurchase = async (req, res, next) => {
  try {
    const {
      supplier,
      purchaseNumber,
      purchaseDate,
      dueDate,
      status,
      paymentStatus,
      subtotal,
      discount,
      tax,
      shippingCost,
      otherCharges,
      totalAmount,
      paidAmount,
      dueAmount,
      paymentMethod,
      referenceNumber,
      notes,
    } = req.body;

    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!isValidObjectId(businessId)) {
      return errorResponse(
        res,
        400,
        "Invalid business ID."
      );
    }

    /*
     * Validate business.
     */
    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found or inactive."
      );
    }

    /*
     * Validate supplier.
     *
     * Supplier must belong to the same business.
     */
    if (!supplier || !isValidObjectId(supplier)) {
      return errorResponse(
        res,
        400,
        "Valid supplier is required."
      );
    }

    const supplierExists = await Supplier.findOne({
      _id: supplier,
      business: businessId,
      isActive: true,
    });

    if (!supplierExists) {
      return errorResponse(
        res,
        404,
        "Supplier not found, inactive, or does not belong to this business."
      );
    }

    /*
     * Generate purchase number if frontend
     * does not provide one.
     */
    let finalPurchaseNumber = purchaseNumber;

    if (!finalPurchaseNumber) {
      finalPurchaseNumber =
        await generatePurchaseNumber(businessId);
    }

    /*
     * Prevent duplicate purchase number
     * inside the same business.
     */
    const existingPurchase = await Purchase.findOne({
      business: businessId,
      purchaseNumber: finalPurchaseNumber,
    });

    if (existingPurchase) {
      return errorResponse(
        res,
        409,
        "Purchase number already exists."
      );
    }

    /*
     * Basic payment validation.
     */
    const finalTotalAmount = Number(totalAmount || 0);
    const finalPaidAmount = Number(paidAmount || 0);

    if (finalPaidAmount > finalTotalAmount) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be greater than total amount."
      );
    }

    /*
     * Calculate due amount.
     *
     * Backend calculation is safer than trusting
     * the frontend's dueAmount.
     */
    const calculatedDueAmount =
      finalTotalAmount - finalPaidAmount;

    /*
     * Automatically determine payment status.
     */
    let finalPaymentStatus = paymentStatus;

    if (!paymentStatus) {
      if (finalPaidAmount <= 0) {
        finalPaymentStatus = "unpaid";
      } else if (finalPaidAmount < finalTotalAmount) {
        finalPaymentStatus = "partially_paid";
      } else {
        finalPaymentStatus = "paid";
      }
    }

    const purchase = await Purchase.create({
      business: businessId,

      supplier,

      purchaseNumber: finalPurchaseNumber,

      purchaseDate:
        purchaseDate || new Date(),

      dueDate: dueDate || null,

      status: status || "draft",

      paymentStatus: finalPaymentStatus,

      subtotal: Number(subtotal || 0),

      discount: Number(discount || 0),

      tax: Number(tax || 0),

      shippingCost: Number(shippingCost || 0),

      otherCharges: Number(otherCharges || 0),

      totalAmount: finalTotalAmount,

      paidAmount: finalPaidAmount,

      dueAmount: calculatedDueAmount,

      paymentMethod:
        paymentMethod || "cash",

      referenceNumber:
        referenceNumber || "",

      notes: notes || "",

      createdBy: req.user._id,

      updatedBy: null,
    });

    const populatedPurchase =
      await Purchase.findById(purchase._id)
        .populate(
          "business",
          "name isActive"
        )
        .populate(
          "supplier",
          "name companyName phone email"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    return successResponse(
      res,
      201,
      "Purchase created successfully.",
      populatedPurchase
    );
  } catch (error) {
    next(error);
  }
};

/*
 * GET ALL PURCHASES
 */
export const getAllPurchases = async (req, res, next) => {
  try {
    const {
      search,
      supplier,
      status,
      paymentStatus,
      paymentMethod,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = req.query;

    const businessId = getBusinessId(req, false);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!isValidObjectId(businessId)) {
      return errorResponse(
        res,
        400,
        "Invalid business ID."
      );
    }

    const filter = {
      business: businessId,
    };

    /*
     * Supplier filter
     */
    if (supplier) {
      if (!isValidObjectId(supplier)) {
        return errorResponse(
          res,
          400,
          "Invalid supplier ID."
        );
      }

      filter.supplier = supplier;
    }

    /*
     * Status filters
     */
    if (status) {
      filter.status = status;
    }

    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    if (paymentMethod) {
      filter.paymentMethod = paymentMethod;
    }

    /*
     * Search by purchase number or reference number.
     */
    if (search) {
      filter.$or = [
        {
          purchaseNumber: {
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
      ];
    }

    /*
     * Date filtering
     */
    if (startDate || endDate) {
      filter.purchaseDate = {};

      if (startDate) {
        const start = new Date(startDate);

        if (Number.isNaN(start.getTime())) {
          return errorResponse(
            res,
            400,
            "Invalid startDate."
          );
        }

        filter.purchaseDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);

        if (Number.isNaN(end.getTime())) {
          return errorResponse(
            res,
            400,
            "Invalid endDate."
          );
        }

        /*
         * Include the complete end date.
         */
        end.setHours(
          23,
          59,
          59,
          999
        );

        filter.purchaseDate.$lte = end;
      }
    }

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const perPage = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (currentPage - 1) * perPage;

    const [purchases, total] =
      await Promise.all([
        Purchase.find(filter)
          .populate(
            "business",
            "name isActive"
          )
          .populate(
            "supplier",
            "name companyName phone email"
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
            purchaseDate: -1,
            createdAt: -1,
          })
          .skip(skip)
          .limit(perPage),

        Purchase.countDocuments(filter),
      ]);

    return successResponse(
      res,
      200,
      "Purchases fetched successfully.",
      {
        purchases,
        pagination: {
          total,
          page: currentPage,
          limit: perPage,
          totalPages: Math.ceil(
            total / perPage
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

/*
 * GET PURCHASE BY ID
 */
export const getPurchaseById = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }

    const businessId = getBusinessId(
      req,
      false
    );

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const purchase =
      await Purchase.findOne({
        _id: id,
        business: businessId,
      })
        .populate(
          "business",
          "name isActive"
        )
        .populate(
          "supplier",
          "name companyName phone alternatePhone email address city country"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    if (!purchase) {
      return errorResponse(
        res,
        404,
        "Purchase not found."
      );
    }

    return successResponse(
      res,
      200,
      "Purchase fetched successfully.",
      purchase
    );
  } catch (error) {
    next(error);
  }
};

/*
 * UPDATE PURCHASE
 */
export const updatePurchase = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }

    const businessId = getBusinessId(
      req,
      false
    );

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    /*
     * Find purchase only inside
     * authenticated user's business.
     */
    const purchase =
      await Purchase.findOne({
        _id: id,
        business: businessId,
      });

    if (!purchase) {
      return errorResponse(
        res,
        404,
        "Purchase not found."
      );
    }

    /*
     * Business cannot be changed.
     */
    if (req.body.business) {
      return errorResponse(
        res,
        400,
        "Business cannot be changed."
      );
    }

    /*
     * Supplier update.
     */
    if (req.body.supplier) {
      if (
        !isValidObjectId(
          req.body.supplier
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid supplier ID."
        );
      }

      const supplierExists =
        await Supplier.findOne({
          _id: req.body.supplier,
          business: businessId,
          isActive: true,
        });

      if (!supplierExists) {
        return errorResponse(
          res,
          404,
          "Supplier not found, inactive, or does not belong to this business."
        );
      }

      purchase.supplier =
        req.body.supplier;
    }

    /*
     * Purchase number update.
     */
    if (req.body.purchaseNumber) {
      const duplicate =
        await Purchase.findOne({
          business: businessId,
          purchaseNumber:
            req.body.purchaseNumber,
          _id: { $ne: id },
        });

      if (duplicate) {
        return errorResponse(
          res,
          409,
          "Purchase number already exists."
        );
      }

      purchase.purchaseNumber =
        req.body.purchaseNumber;
    }

    /*
     * Basic fields.
     */
    const allowedFields = [
      "purchaseDate",
      "dueDate",
      "status",
      "paymentMethod",
      "referenceNumber",
      "notes",
      "subtotal",
      "discount",
      "tax",
      "shippingCost",
      "otherCharges",
    ];

    for (const field of allowedFields) {
      if (
        req.body[field] !== undefined
      ) {
        purchase[field] =
          req.body[field];
      }
    }

    /*
     * Payment amount.
     */
    if (
      req.body.paidAmount !== undefined
    ) {
      const newPaidAmount = Number(
        req.body.paidAmount
      );

      if (newPaidAmount < 0) {
        return errorResponse(
          res,
          400,
          "Paid amount cannot be negative."
        );
      }

      purchase.paidAmount =
        newPaidAmount;
    }

    /*
     * Calculate total.
     *
     * For now, if totalAmount is provided,
     * use it. Later, PurchaseItem will
     * become the source of truth.
     */
    if (
      req.body.totalAmount !== undefined
    ) {
      const newTotalAmount = Number(
        req.body.totalAmount
      );

      if (newTotalAmount < 0) {
        return errorResponse(
          res,
          400,
          "Total amount cannot be negative."
        );
      }

      purchase.totalAmount =
        newTotalAmount;
    }

    /*
     * Recalculate due amount.
     */
    if (
      purchase.paidAmount >
      purchase.totalAmount
    ) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be greater than total amount."
      );
    }

    purchase.dueAmount =
      purchase.totalAmount -
      purchase.paidAmount;

    /*
     * Recalculate payment status.
     */
    if (
      purchase.paidAmount <= 0
    ) {
      purchase.paymentStatus =
        "unpaid";
    } else if (
      purchase.paidAmount <
      purchase.totalAmount
    ) {
      purchase.paymentStatus =
        "partially_paid";
    } else {
      purchase.paymentStatus =
        "paid";
    }

    /*
     * Prevent manually changing
     * paymentStatus to an incorrect value.
     */

    purchase.updatedBy =
      req.user._id;

    await purchase.save();

    const updatedPurchase =
      await Purchase.findById(
        purchase._id
      )
        .populate(
          "business",
          "name isActive"
        )
        .populate(
          "supplier",
          "name companyName phone email"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    return successResponse(
      res,
      200,
      "Purchase updated successfully.",
      updatedPurchase
    );
  } catch (error) {
    next(error);
  }
};

/*
 * DELETE / CANCEL PURCHASE
 *
 * We do not permanently delete purchases
 * because financial/stock transactions
 * should remain traceable.
 */
export const deletePurchase = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }

    const businessId = getBusinessId(
      req,
      false
    );

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const purchase =
      await Purchase.findOne({
        _id: id,
        business: businessId,
      });

    if (!purchase) {
      return errorResponse(
        res,
        404,
        "Purchase not found."
      );
    }

    /*
     * If already cancelled.
     */
    if (
      purchase.status === "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Purchase is already cancelled."
      );
    }

    /*
     * Do not physically delete it.
     */
    purchase.status = "cancelled";
    purchase.updatedBy =
      req.user._id;

    await purchase.save();

    return successResponse(
      res,
      200,
      "Purchase cancelled successfully.",
      purchase
    );
  } catch (error) {
    next(error);
  }
};

/*
 * RESTORE PURCHASE
 *
 * This is mainly useful if a purchase was
 * cancelled by mistake.
 */
export const restorePurchase = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }

    const businessId = getBusinessId(
      req,
      false
    );

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const purchase =
      await Purchase.findOne({
        _id: id,
        business: businessId,
      });

    if (!purchase) {
      return errorResponse(
        res,
        404,
        "Purchase not found."
      );
    }

    if (
      purchase.status !== "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Only cancelled purchases can be restored."
      );
    }

    purchase.status = "draft";
    purchase.updatedBy =
      req.user._id;

    await purchase.save();

    return successResponse(
      res,
      200,
      "Purchase restored successfully.",
      purchase
    );
  } catch (error) {
    next(error);
  }
};