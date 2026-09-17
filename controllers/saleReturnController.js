import mongoose from "mongoose";

import SaleReturn from "../models/SaleReturn.js";
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

const validateBusiness = async (businessId, session = null) => {
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

  const query = Business.findOne({
    _id: businessId,
    isActive: true,
  });

  if (session) {
    query.session(session);
  }

  const business = await query;

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
// HELPER: GENERATE RETURN NUMBER
// ==================================================

const generateReturnNumber = async (
  businessId,
  session = null
) => {
  const query = SaleReturn.findOne({
    business: businessId,
  })
    .sort({ createdAt: -1 })
    .select("returnNumber");

  if (session) {
    query.session(session);
  }

  const lastReturn = await query;

  if (!lastReturn) {
    return "RET-000001";
  }

  const lastNumber = parseInt(
    lastReturn.returnNumber.replace("RET-", ""),
    10
  );

  const nextNumber = Number.isNaN(lastNumber)
    ? 1
    : lastNumber + 1;

  return `RET-${String(nextNumber).padStart(6, "0")}`;
};


// ==================================================
// CREATE SALE RETURN
// ==================================================

export const createSaleReturn = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const businessId = getBusinessId(req);

    // ----------------------------------------------
    // Validate Business
    // ----------------------------------------------

    const businessCheck = await validateBusiness(
      businessId,
      session
    );

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
      returnNumber,
      returnDate,
      reason = "",
      notes = "",
    } = req.body;

    // ----------------------------------------------
    // Validate Sale
    // ----------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(sale)) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

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

    // ----------------------------------------------
    // Validate Sale Status
    // ----------------------------------------------

    if (saleRecord.status === "cancelled") {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "A cancelled sale cannot be returned."
      );
    }

    if (saleRecord.status === "draft") {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "A draft sale cannot be returned. Complete the sale first."
      );
    }

    // ----------------------------------------------
    // Validate Customer
    // ----------------------------------------------

    let customerId =
      saleRecord.customer || null;

    if (customer !== undefined) {
      if (customer === null) {
        customerId = null;
      } else {
        if (
          !mongoose.Types.ObjectId.isValid(customer)
        ) {
          await session.abortTransaction();

          return errorResponse(
            res,
            400,
            "Invalid customer ID."
          );
        }

        const customerRecord =
          await Customer.findOne({
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

        customerId = customerRecord._id;
      }
    }

    // ----------------------------------------------
    // Prevent Duplicate Return Number
    // ----------------------------------------------

    let finalReturnNumber = returnNumber;

    if (!finalReturnNumber) {
      finalReturnNumber =
        await generateReturnNumber(
          businessId,
          session
        );
    }

    const existingReturn =
      await SaleReturn.findOne({
        business: businessId,
        returnNumber: finalReturnNumber,
      }).session(session);

    if (existingReturn) {
      await session.abortTransaction();

      return errorResponse(
        res,
        409,
        "Return number already exists."
      );
    }

    // ----------------------------------------------
    // Create Return
    // ----------------------------------------------
    //
    // IMPORTANT:
    // Return starts as DRAFT.
    //
    // SaleReturnItem will later calculate:
    // subtotal
    // discount
    // tax
    // totalAmount
    // refundAmount
    //
    // Stock will also be returned only when the
    // return is completed.
    // ----------------------------------------------

    const [newSaleReturn] =
      await SaleReturn.create(
        [
          {
            business: businessId,
            sale: saleRecord._id,
            customer: customerId,

            returnNumber: finalReturnNumber,

            returnDate:
              returnDate || new Date(),

            status: "draft",

            refundStatus:
              "not_refunded",

            subtotal: 0,
            discount: 0,
            tax: 0,
            totalAmount: 0,
            refundAmount: 0,

            reason,
            notes,

            createdBy: req.user._id,
          },
        ],
        { session }
      );

    await session.commitTransaction();

    const populatedReturn =
      await SaleReturn.findById(
        newSaleReturn._id
      )
        .populate(
          "sale",
          "saleNumber totalAmount status"
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
      "Sale return created successfully.",
      populatedReturn
    );
  } catch (error) {
    await session.abortTransaction();

    console.error(
      "Create Sale Return Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to create sale return.",
      error.message
    );
  } finally {
    session.endSession();
  }
};


// ==================================================
// GET ALL SALE RETURNS
// ==================================================

export const getAllSaleReturns = async (req, res) => {
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
      refundStatus,
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
      (pageNumber - 1) * limitNumber;

    const filter = {
      business: businessId,
    };

    // ----------------------------------------------
    // Filters
    // ----------------------------------------------

    if (sale) {
      if (
        !mongoose.Types.ObjectId.isValid(sale)
      ) {
        return errorResponse(
          res,
          400,
          "Invalid sale ID."
        );
      }

      filter.sale = sale;
    }

    if (customer) {
      if (
        !mongoose.Types.ObjectId.isValid(customer)
      ) {
        return errorResponse(
          res,
          400,
          "Invalid customer ID."
        );
      }

      filter.customer = customer;
    }

    if (status) {
      filter.status = status;
    }

    if (refundStatus) {
      filter.refundStatus =
        refundStatus;
    }

    // ----------------------------------------------
    // Search
    // ----------------------------------------------

    if (search) {
      filter.returnNumber = {
        $regex: search,
        $options: "i",
      };
    }

    // ----------------------------------------------
    // Date Filter
    // ----------------------------------------------

    if (startDate || endDate) {
      filter.returnDate = {};

      if (startDate) {
        filter.returnDate.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const endDateValue =
          new Date(endDate);

        endDateValue.setHours(
          23,
          59,
          59,
          999
        );

        filter.returnDate.$lte =
          endDateValue;
      }
    }

    // ----------------------------------------------
    // Fetch
    // ----------------------------------------------

    const [returns, total] =
      await Promise.all([
        SaleReturn.find(filter)
          .populate(
            "sale",
            "saleNumber totalAmount status"
          )
          .populate(
            "customer",
            "name phone"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .sort({
            returnDate: -1,
          })
          .skip(skip)
          .limit(limitNumber),

        SaleReturn.countDocuments(filter),
      ]);

    return successResponse(
      res,
      200,
      "Sale returns fetched successfully.",
      {
        returns,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(
            total / limitNumber
          ),
        },
      }
    );
  } catch (error) {
    console.error(
      "Get Sale Returns Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sale returns.",
      error.message
    );
  }
};


// ==================================================
// GET SALE RETURNS BY SALE
// ==================================================

export const getSaleReturnsBySale = async (
  req,
  res
) => {
  try {
    const businessId = getBusinessId(req);
    const { saleId } = req.params;

    const businessCheck =
      await validateBusiness(businessId);

    if (!businessCheck.valid) {
      return errorResponse(
        res,
        400,
        businessCheck.message
      );
    }

    if (
      !mongoose.Types.ObjectId.isValid(saleId)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    const saleRecord = await Sale.findOne({
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

    const returns = await SaleReturn.find({
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
      .sort({
        returnDate: -1,
      });

    return successResponse(
      res,
      200,
      "Sale returns fetched successfully.",
      {
        sale: {
          _id: saleRecord._id,
          saleNumber:
            saleRecord.saleNumber,
          totalAmount:
            saleRecord.totalAmount,
          status: saleRecord.status,
        },
        returns,
      }
    );
  } catch (error) {
    console.error(
      "Get Sale Returns By Sale Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sale returns.",
      error.message
    );
  }
};


// ==================================================
// GET SALE RETURN BY ID
// ==================================================

export const getSaleReturnById = async (
  req,
  res
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    const businessCheck =
      await validateBusiness(businessId);

    if (!businessCheck.valid) {
      return errorResponse(
        res,
        400,
        businessCheck.message
      );
    }

    if (
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale return ID."
      );
    }

    const saleReturn =
      await SaleReturn.findOne({
        _id: id,
        business: businessId,
      })
        .populate(
          "sale",
          "saleNumber totalAmount paidAmount dueAmount status"
        )
        .populate(
          "customer",
          "name phone email"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    if (!saleReturn) {
      return errorResponse(
        res,
        404,
        "Sale return not found."
      );
    }

    return successResponse(
      res,
      200,
      "Sale return fetched successfully.",
      saleReturn
    );
  } catch (error) {
    console.error(
      "Get Sale Return Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sale return.",
      error.message
    );
  }
};


// ==================================================
// UPDATE SALE RETURN
// ==================================================

export const updateSaleReturn = async (
  req,
  res
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const businessId = getBusinessId(req);
    const { id } = req.params;

    const businessCheck =
      await validateBusiness(
        businessId,
        session
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
      !mongoose.Types.ObjectId.isValid(id)
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Invalid sale return ID."
      );
    }

    const saleReturn =
      await SaleReturn.findOne({
        _id: id,
        business: businessId,
      }).session(session);

    if (!saleReturn) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Sale return not found."
      );
    }

    // ----------------------------------------------
    // Completed / Cancelled Returns
    // ----------------------------------------------

    if (saleReturn.status === "completed") {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "A completed sale return cannot be edited."
      );
    }

    if (saleReturn.status === "cancelled") {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "A cancelled sale return cannot be edited."
      );
    }

    const {
      customer,
      returnDate,
      status,
      refundStatus,
      reason,
      notes,
    } = req.body;

    // ----------------------------------------------
    // Customer
    // ----------------------------------------------

    if (customer !== undefined) {
      if (customer === null) {
        saleReturn.customer = null;
      } else {
        if (
          !mongoose.Types.ObjectId.isValid(
            customer
          )
        ) {
          await session.abortTransaction();

          return errorResponse(
            res,
            400,
            "Invalid customer ID."
          );
        }

        const customerRecord =
          await Customer.findOne({
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

        saleReturn.customer =
          customerRecord._id;
      }
    }

    // ----------------------------------------------
    // Update Basic Fields
    // ----------------------------------------------

    if (returnDate !== undefined) {
      saleReturn.returnDate =
        returnDate;
    }

    if (reason !== undefined) {
      saleReturn.reason = reason;
    }

    if (notes !== undefined) {
      saleReturn.notes = notes;
    }

    // ----------------------------------------------
    // Status
    // ----------------------------------------------

    if (status !== undefined) {
      // We don't allow manually completing
      // the return before SaleReturnItems exist.
      if (status === "completed") {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Complete the sale return through the return completion workflow after adding return items."
        );
      }

      saleReturn.status = status;
    }

    // ----------------------------------------------
    // Refund Status
    // ----------------------------------------------

    if (refundStatus !== undefined) {
      saleReturn.refundStatus =
        refundStatus;
    }

    saleReturn.updatedBy =
      req.user._id;

    await saleReturn.save({
      session,
    });

    await session.commitTransaction();

    const updatedReturn =
      await SaleReturn.findById(
        saleReturn._id
      )
        .populate(
          "sale",
          "saleNumber totalAmount status"
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
      "Sale return updated successfully.",
      updatedReturn
    );
  } catch (error) {
    await session.abortTransaction();

    console.error(
      "Update Sale Return Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to update sale return.",
      error.message
    );
  } finally {
    session.endSession();
  }
};


// ==================================================
// CANCEL SALE RETURN
// ==================================================

export const cancelSaleReturn = async (
  req,
  res
) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const businessId = getBusinessId(req);
    const { id } = req.params;

    const saleReturn =
      await SaleReturn.findOne({
        _id: id,
        business: businessId,
      }).session(session);

    if (!saleReturn) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Sale return not found."
      );
    }

    if (
      saleReturn.status === "cancelled"
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Sale return is already cancelled."
      );
    }

    if (
      saleReturn.status === "completed"
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "A completed return cannot be cancelled. Use a proper reversal workflow."
      );
    }

    saleReturn.status = "cancelled";
    saleReturn.updatedBy = req.user._id;

    await saleReturn.save({
      session,
    });

    await session.commitTransaction();

    return successResponse(
      res,
      200,
      "Sale return cancelled successfully.",
      saleReturn
    );
  } catch (error) {
    await session.abortTransaction();

    console.error(
      "Cancel Sale Return Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to cancel sale return.",
      error.message
    );
  } finally {
    session.endSession();
  }
};


// ==================================================
// RESTORE SALE RETURN
// ==================================================

export const restoreSaleReturn = async (
  req,
  res
) => {
  try {
    const businessId = getBusinessId(req);
    const { id } = req.params;

    const saleReturn =
      await SaleReturn.findOne({
        _id: id,
        business: businessId,
      });

    if (!saleReturn) {
      return errorResponse(
        res,
        404,
        "Sale return not found."
      );
    }

    if (
      saleReturn.status !== "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Only cancelled sale returns can be restored."
      );
    }

    saleReturn.status = "draft";
    saleReturn.updatedBy = req.user._id;

    await saleReturn.save();

    return successResponse(
      res,
      200,
      "Sale return restored successfully.",
      saleReturn
    );
  } catch (error) {
    console.error(
      "Restore Sale Return Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to restore sale return.",
      error.message
    );
  }
};


// ==================================================
// DELETE SALE RETURN
// ==================================================

export const deleteSaleReturn = async (
  req,
  res
) => {
  return errorResponse(
    res,
    400,
    "Sale returns should not be permanently deleted. Cancel the return instead."
  );
};