import mongoose from "mongoose";

import SaleReturnItem from "../models/SaleReturnItem.js";
import SaleReturn from "../models/SaleReturn.js";
import SaleItem from "../models/SaleItem.js";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import Business from "../models/Business.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";


// ==================================================
// HELPER: SUPER ADMIN
// ==================================================

const isSuperAdmin = (req) => {
  return req.user?.role?.slug === "super-admin";
};


// ==================================================
// HELPER: BUSINESS ID
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

const validateBusiness = async (
  businessId,
  session = null
) => {
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
// HELPER: CALCULATE LINE VALUES
// ==================================================

const calculateLineValues = ({
  quantity,
  salePrice,
  discount = 0,
  tax = 0,
}) => {
  const lineSubtotal = quantity * salePrice;

  const taxableAmount = Math.max(
    lineSubtotal - discount,
    0
  );

  const calculatedTax = tax;

  const lineTotal = Math.max(
    taxableAmount + calculatedTax,
    0
  );

  return {
    lineSubtotal,
    lineTotal,
  };
};


// ==================================================
// HELPER: RECALCULATE SALE RETURN TOTALS
// ==================================================

const recalculateSaleReturnTotals = async (
  saleReturnId,
  session = null
) => {
  const query = SaleReturnItem.find({
    saleReturn: saleReturnId,
  });

  if (session) {
    query.session(session);
  }

  const items = await query.select(
    "lineSubtotal discount tax lineTotal"
  );

  const subtotal = items.reduce(
    (total, item) =>
      total + item.lineSubtotal,
    0
  );

  const discount = items.reduce(
    (total, item) =>
      total + item.discount,
    0
  );

  const tax = items.reduce(
    (total, item) =>
      total + item.tax,
    0
  );

  const totalAmount = items.reduce(
    (total, item) =>
      total + item.lineTotal,
    0
  );

  const returnQuery =
    SaleReturn.findById(saleReturnId);

  if (session) {
    returnQuery.session(session);
  }

  const saleReturn = await returnQuery;

  if (!saleReturn) {
    throw new Error(
      "Sale return not found."
    );
  }

  saleReturn.subtotal = subtotal;
  saleReturn.discount = discount;
  saleReturn.tax = tax;
  saleReturn.totalAmount = totalAmount;

  // Refund amount is initially equal to
  // completed return amount.
  if (
    saleReturn.refundStatus ===
    "not_refunded"
  ) {
    saleReturn.refundAmount = 0;
  }

  await saleReturn.save(
    session ? { session } : {}
  );

  return {
    subtotal,
    discount,
    tax,
    totalAmount,
  };
};


// ==================================================
// CREATE SALE RETURN ITEM
// ==================================================

export const createSaleReturnItem = async (
  req,
  res
) => {
  const session =
    await mongoose.startSession();

  try {
    session.startTransaction();

    const businessId =
      getBusinessId(req);

    // ----------------------------------------------
    // Business
    // ----------------------------------------------

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

    const {
      saleReturn,
      saleItem,
      quantity,
      discount,
      tax,
      reason = "",
    } = req.body;

    // ----------------------------------------------
    // Validate Sale Return
    // ----------------------------------------------

    if (
      !mongoose.Types.ObjectId.isValid(
        saleReturn
      )
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Invalid sale return ID."
      );
    }

    const returnRecord =
      await SaleReturn.findOne({
        _id: saleReturn,
        business: businessId,
      }).session(session);

    if (!returnRecord) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Sale return not found."
      );
    }

    // ----------------------------------------------
    // Return must be editable
    // ----------------------------------------------

    if (
      returnRecord.status !== "draft"
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Only draft sale returns can have items added."
      );
    }

    // ----------------------------------------------
    // Validate Original Sale
    // ----------------------------------------------

    const saleRecord =
      await Sale.findOne({
        _id: returnRecord.sale,
        business: businessId,
      }).session(session);

    if (!saleRecord) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Original sale not found."
      );
    }

    if (
      saleRecord.status === "cancelled"
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Items cannot be returned from a cancelled sale."
      );
    }

    if (
      saleRecord.status === "draft"
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Items cannot be returned from a draft sale."
      );
    }

    // ----------------------------------------------
    // Validate Original SaleItem
    // ----------------------------------------------

    if (
      !mongoose.Types.ObjectId.isValid(
        saleItem
      )
    ) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const originalSaleItem =
      await SaleItem.findOne({
        _id: saleItem,
        business: businessId,
        sale: saleRecord._id,
      }).session(session);

    if (!originalSaleItem) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Original sale item not found."
      );
    }

    // ----------------------------------------------
    // Validate Product
    // ----------------------------------------------

    const product =
      await Product.findOne({
        _id: originalSaleItem.product,
        business: businessId,
        isActive: true,
      }).session(session);

    if (!product) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Product not found or inactive."
      );
    }

    // ----------------------------------------------
    // Validate Product Inventory
    // ----------------------------------------------

    const productInventory =
      await ProductInventory.findOne({
        _id:
          originalSaleItem.productInventory,
        business: businessId,
        product: originalSaleItem.product,
        isActive: true,
      }).session(session);

    if (!productInventory) {
      await session.abortTransaction();

      return errorResponse(
        res,
        404,
        "Product inventory not found or inactive."
      );
    }

    // ----------------------------------------------
    // Check Previously Returned Quantity
    // ----------------------------------------------

    const existingReturnedItems =
      await SaleReturnItem.find({
        saleItem: originalSaleItem._id,
        business: businessId,
      }).session(session);

    const alreadyReturned =
      existingReturnedItems.reduce(
        (total, item) =>
          total + item.quantity,
        0
      );

    const remainingReturnable =
      Math.max(
        originalSaleItem.quantity -
          alreadyReturned,
        0
      );

    if (quantity > remainingReturnable) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        `Only ${remainingReturnable} quantity is available for return.`
      );
    }

    if (remainingReturnable <= 0) {
      await session.abortTransaction();

      return errorResponse(
        res,
        400,
        "This sale item has already been fully returned."
      );
    }

    // ----------------------------------------------
    // Prevent Duplicate Item
    // ----------------------------------------------

    const existingItem =
      await SaleReturnItem.findOne({
        saleReturn: returnRecord._id,
        saleItem: originalSaleItem._id,
      }).session(session);

    if (existingItem) {
      await session.abortTransaction();

      return errorResponse(
        res,
        409,
        "This sale item already exists in the return."
      );
    }

    // ----------------------------------------------
    // Use Original Sale Values
    // ----------------------------------------------

    const salePrice =
      originalSaleItem.salePrice;

    const finalDiscount =
      discount !== undefined
        ? discount
        : originalSaleItem.discount;

    const finalTax =
      tax !== undefined
        ? tax
        : originalSaleItem.tax;

    // ----------------------------------------------
    // Calculate Return Item
    // ----------------------------------------------

    const {
      lineSubtotal,
      lineTotal,
    } = calculateLineValues({
      quantity,
      salePrice,
      discount: finalDiscount,
      tax: finalTax,
    });

    // ----------------------------------------------
    // Create Return Item
    // ----------------------------------------------

    const [newReturnItem] =
      await SaleReturnItem.create(
        [
          {
            business: businessId,

            saleReturn:
              returnRecord._id,

            sale: saleRecord._id,

            saleItem:
              originalSaleItem._id,

            product:
              originalSaleItem.product,

            productInventory:
              originalSaleItem.productInventory,

            quantity,

            salePrice,

            discount: finalDiscount,

            tax: finalTax,

            lineSubtotal,

            lineTotal,

            reason,

            createdBy: req.user._id,
          },
        ],
        {
          session,
        }
      );

    // ----------------------------------------------
    // Recalculate Return Totals
    // ----------------------------------------------

    const returnTotals =
      await recalculateSaleReturnTotals(
        returnRecord._id,
        session
      );

    await session.commitTransaction();

    // ----------------------------------------------
    // Populate Response
    // ----------------------------------------------

    const populatedItem =
      await SaleReturnItem.findById(
        newReturnItem._id
      )
        .populate(
          "saleReturn",
          "returnNumber status totalAmount"
        )
        .populate(
          "sale",
          "saleNumber totalAmount"
        )
        .populate(
          "saleItem",
          "quantity salePrice returnedQuantity"
        )
        .populate(
          "product",
          "name sku"
        )
        .populate(
          "productInventory",
          "color size quantity"
        );

    return successResponse(
      res,
      201,
      "Sale return item created successfully.",
      {
        item: populatedItem,
        returnTotals,
      }
    );
  } catch (error) {
    await session.abortTransaction();

    console.error(
      "Create Sale Return Item Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to create sale return item.",
      error.message
    );
  } finally {
    session.endSession();
  }
};


// ==================================================
// GET ALL SALE RETURN ITEMS
// ==================================================

export const getAllSaleReturnItems = async (
  req,
  res
) => {
  try {
    const businessId =
      getBusinessId(req);

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

    const {
      page = 1,
      limit = 20,
      saleReturn,
      sale,
      saleItem,
      product,
      productInventory,
      search,
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

    if (saleReturn) {
      filter.saleReturn =
        saleReturn;
    }

    if (sale) {
      filter.sale = sale;
    }

    if (saleItem) {
      filter.saleItem =
        saleItem;
    }

    if (product) {
      filter.product =
        product;
    }

    if (productInventory) {
      filter.productInventory =
        productInventory;
    }

    if (search) {
      filter.reason = {
        $regex: search,
        $options: "i",
      };
    }

    const [
      items,
      total,
    ] = await Promise.all([
      SaleReturnItem.find(filter)
        .populate(
          "saleReturn",
          "returnNumber status totalAmount"
        )
        .populate(
          "sale",
          "saleNumber totalAmount"
        )
        .populate(
          "product",
          "name sku"
        )
        .populate(
          "productInventory",
          "color size quantity"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber),

      SaleReturnItem.countDocuments(
        filter
      ),
    ]);

    return successResponse(
      res,
      200,
      "Sale return items fetched successfully.",
      {
        items,
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
      "Get Sale Return Items Error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sale return items.",
      error.message
    );
  }
};


// ==================================================
// GET ITEMS BY SALE RETURN
// ==================================================

export const getSaleReturnItemsByReturn =
  async (req, res) => {
    try {
      const businessId =
        getBusinessId(req);

      const {
        returnId,
      } = req.params;

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
          returnId
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid sale return ID."
        );
      }

      const returnRecord =
        await SaleReturn.findOne({
          _id: returnId,
          business: businessId,
        });

      if (!returnRecord) {
        return errorResponse(
          res,
          404,
          "Sale return not found."
        );
      }

      const items =
        await SaleReturnItem.find({
          business: businessId,
          saleReturn: returnId,
        })
          .populate(
            "saleItem",
            "quantity salePrice returnedQuantity"
          )
          .populate(
            "product",
            "name sku"
          )
          .populate(
            "productInventory",
            "color size quantity"
          )
          .sort({
            createdAt: 1,
          });

      return successResponse(
        res,
        200,
        "Sale return items fetched successfully.",
        {
          saleReturn: {
            _id: returnRecord._id,
            returnNumber:
              returnRecord.returnNumber,
            status:
              returnRecord.status,
            totalAmount:
              returnRecord.totalAmount,
          },
          items,
        }
      );
    } catch (error) {
      console.error(
        "Get Return Items Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to fetch sale return items.",
        error.message
      );
    }
  };


// ==================================================
// GET ITEM BY ID
// ==================================================

export const getSaleReturnItemById =
  async (req, res) => {
    try {
      const businessId =
        getBusinessId(req);

      const { id } = req.params;

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
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return errorResponse(
          res,
          400,
          "Invalid sale return item ID."
        );
      }

      const item =
        await SaleReturnItem.findOne({
          _id: id,
          business: businessId,
        })
          .populate(
            "saleReturn",
            "returnNumber status totalAmount"
          )
          .populate(
            "sale",
            "saleNumber totalAmount"
          )
          .populate(
            "saleItem",
            "quantity salePrice returnedQuantity"
          )
          .populate(
            "product",
            "name sku"
          )
          .populate(
            "productInventory",
            "color size quantity"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .populate(
            "updatedBy",
            "name email"
          );

      if (!item) {
        return errorResponse(
          res,
          404,
          "Sale return item not found."
        );
      }

      return successResponse(
        res,
        200,
        "Sale return item fetched successfully.",
        item
      );
    } catch (error) {
      console.error(
        "Get Sale Return Item Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to fetch sale return item.",
        error.message
      );
    }
  };


// ==================================================
// UPDATE SALE RETURN ITEM
// ==================================================

export const updateSaleReturnItem =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      const businessId =
        getBusinessId(req);

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
          "Invalid sale return item ID."
        );
      }

      const item =
        await SaleReturnItem.findOne({
          _id: id,
          business: businessId,
        }).session(session);

      if (!item) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale return item not found."
        );
      }

      const returnRecord =
        await SaleReturn.findOne({
          _id: item.saleReturn,
          business: businessId,
        }).session(session);

      if (!returnRecord) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale return not found."
        );
      }

      // Only draft returns can be edited
      if (
        returnRecord.status !== "draft"
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Only draft sale returns can be edited."
        );
      }

      const {
        quantity,
        discount,
        tax,
        reason,
      } = req.body;

      // ----------------------------------------------
      // Get Original SaleItem
      // ----------------------------------------------

      const originalSaleItem =
        await SaleItem.findOne({
          _id: item.saleItem,
          business: businessId,
        }).session(session);

      if (!originalSaleItem) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Original sale item not found."
        );
      }

      // ----------------------------------------------
      // Check Return Quantity
      // ----------------------------------------------

      if (quantity !== undefined) {
        const otherReturnedItems =
          await SaleReturnItem.find({
            saleItem:
              originalSaleItem._id,
            _id: {
              $ne: item._id,
            },
            business: businessId,
          })
            .session(session)
            .select("quantity");

        const otherReturned =
          otherReturnedItems.reduce(
            (total, returnItem) =>
              total + returnItem.quantity,
            0
          );

        const maxReturnable =
          Math.max(
            originalSaleItem.quantity -
              otherReturned,
            0
          );

        if (
          quantity > maxReturnable
        ) {
          await session.abortTransaction();

          return errorResponse(
            res,
            400,
            `Only ${maxReturnable} quantity is available for return.`
          );
        }

        item.quantity = quantity;
      }

      // ----------------------------------------------
      // Update Discount / Tax
      // ----------------------------------------------

      if (discount !== undefined) {
        item.discount =
          discount;
      }

      if (tax !== undefined) {
        item.tax = tax;
      }

      if (reason !== undefined) {
        item.reason = reason;
      }

      // ----------------------------------------------
      // Recalculate
      // ----------------------------------------------

      const {
        lineSubtotal,
        lineTotal,
      } = calculateLineValues({
        quantity: item.quantity,
        salePrice: item.salePrice,
        discount: item.discount,
        tax: item.tax,
      });

      item.lineSubtotal =
        lineSubtotal;

      item.lineTotal =
        lineTotal;

      item.updatedBy =
        req.user._id;

      await item.save({
        session,
      });

      const returnTotals =
        await recalculateSaleReturnTotals(
          returnRecord._id,
          session
        );

      await session.commitTransaction();

      const updatedItem =
        await SaleReturnItem.findById(
          item._id
        )
          .populate(
            "product",
            "name sku"
          )
          .populate(
            "productInventory",
            "color size quantity"
          );

      return successResponse(
        res,
        200,
        "Sale return item updated successfully.",
        {
          item: updatedItem,
          returnTotals,
        }
      );
    } catch (error) {
      await session.abortTransaction();

      console.error(
        "Update Sale Return Item Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to update sale return item.",
        error.message
      );
    } finally {
      session.endSession();
    }
  };


// ==================================================
// DELETE SALE RETURN ITEM
// ==================================================

export const deleteSaleReturnItem =
  async (req, res) => {
    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      const businessId =
        getBusinessId(req);

      const { id } = req.params;

      const item =
        await SaleReturnItem.findOne({
          _id: id,
          business: businessId,
        }).session(session);

      if (!item) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale return item not found."
        );
      }

      const returnRecord =
        await SaleReturn.findOne({
          _id: item.saleReturn,
          business: businessId,
        }).session(session);

      if (!returnRecord) {
        await session.abortTransaction();

        return errorResponse(
          res,
          404,
          "Sale return not found."
        );
      }

      // Only draft returns can have items deleted
      if (
        returnRecord.status !== "draft"
      ) {
        await session.abortTransaction();

        return errorResponse(
          res,
          400,
          "Only draft sale returns can have items deleted."
        );
      }

      await SaleReturnItem.deleteOne({
        _id: item._id,
      }).session(session);

      const returnTotals =
        await recalculateSaleReturnTotals(
          returnRecord._id,
          session
        );

      await session.commitTransaction();

      return successResponse(
        res,
        200,
        "Sale return item deleted successfully.",
        {
          returnTotals,
        }
      );
    } catch (error) {
      await session.abortTransaction();

      console.error(
        "Delete Sale Return Item Error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to delete sale return item.",
        error.message
      );
    } finally {
      session.endSession();
    }
  };