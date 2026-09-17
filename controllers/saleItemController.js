import mongoose from "mongoose";

import SaleItem from "../models/SaleItem.js";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
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
 * Resolve business.
 *
 * Super Admin can provide business.
 * Admin / Manager always use their own business.
 */
const getBusinessId = (req) => {
  if (isSuperAdmin(req)) {
    return req.body.business || req.query.business;
  }

  return req.user?.business?._id || req.user?.business;
};

/*
 * Validate business.
 */
const validateBusiness = async (businessId) => {
  if (!businessId || !isValidObjectId(businessId)) {
    return null;
  }

  return Business.findOne({
    _id: businessId,
    isActive: true,
  });
};

/*
 * Calculate line values.
 */
const calculateLineValues = ({
  quantity,
  salePrice,
  discount = 0,
  tax = 0,
}) => {
  const lineSubtotal = quantity * salePrice;

  const discountAmount = Math.min(
    discount,
    lineSubtotal
  );

  const afterDiscount =
    lineSubtotal - discountAmount;

  const lineTotal =
    afterDiscount + tax;

  return {
    lineSubtotal,
    lineTotal,
  };
};

/*
 * CREATE SALE ITEM
 */
export const createSaleItem = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        400,
        "Valid active business is required."
      );
    }

    const {
      sale,
      product,
      productInventory,
      quantity,
    } = req.body;

    /*
     * Validate Sale
     */
    if (!isValidObjectId(sale)) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    const saleDoc = await Sale.findOne({
      _id: sale,
      business: businessId,
    });

    if (!saleDoc) {
      return errorResponse(
        res,
        404,
        "Sale not found for this business."
      );
    }

    /*
     * Don't allow items to be added to
     * cancelled/returned sales.
     */
    if (
      ["cancelled", "returned"].includes(
        saleDoc.status
      )
    ) {
      return errorResponse(
        res,
        400,
        "Sale cannot accept new items in its current status."
      );
    }

    /*
     * Validate Product
     */
    const productDoc = await Product.findOne({
      _id: product,
      business: businessId,
      isActive: true,
    });

    if (!productDoc) {
      return errorResponse(
        res,
        404,
        "Product not found for this business."
      );
    }

    /*
     * Validate Product Inventory
     */
    const inventory = await ProductInventory.findOne({
      _id: productInventory,
      business: businessId,
      product: product,
      isActive: true,
    });

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Product inventory variant not found for this business."
      );
    }

    /*
     * Make sure enough stock exists.
     */
    if (quantity > inventory.quantity) {
      return errorResponse(
        res,
        400,
        `Insufficient stock. Available quantity is ${inventory.quantity}.`
      );
    }

    /*
     * Prevent duplicate inventory variant
     * in the same sale.
     */
    const existingItem = await SaleItem.findOne({
      sale: sale,
      productInventory: productInventory,
    });

    if (existingItem) {
      return errorResponse(
        res,
        409,
        "This product inventory already exists in the sale."
      );
    }

    /*
     * Use inventory sale price when frontend
     * does not provide a price.
     */
    const salePrice =
      req.body.salePrice ?? inventory.salePrice;

    const discount =
      req.body.discount ?? inventory.discount ?? 0;

    const tax =
      req.body.tax ?? inventory.tax ?? 0;

    const {
      lineSubtotal,
      lineTotal,
    } = calculateLineValues({
      quantity,
      salePrice,
      discount,
      tax,
    });

    const saleItem = await SaleItem.create({
      business: businessId,
      sale: sale,
      product: product,
      productInventory: productInventory,
      quantity,
      salePrice,
      discount,
      tax,
      lineSubtotal,
      lineTotal,
      createdBy: req.user._id,
    });

    /*
     * Recalculate Sale totals.
     */
    const items = await SaleItem.find({
      sale: sale,
      business: businessId,
    });

    const subtotal = items.reduce(
      (total, item) =>
        total + item.lineSubtotal,
      0
    );

    const itemDiscount = items.reduce(
      (total, item) =>
        total + item.discount,
      0
    );

    const itemTax = items.reduce(
      (total, item) =>
        total + item.tax,
      0
    );

    saleDoc.subtotal = subtotal;
    saleDoc.discount = itemDiscount;
    saleDoc.tax = itemTax;

    saleDoc.totalAmount =
      subtotal -
      itemDiscount +
      itemTax +
      saleDoc.shippingCost +
      saleDoc.otherCharges;

    saleDoc.paidAmount = Math.min(
      saleDoc.paidAmount,
      saleDoc.totalAmount
    );

    saleDoc.dueAmount =
      saleDoc.totalAmount -
      saleDoc.paidAmount;

    if (saleDoc.dueAmount <= 0) {
      saleDoc.paymentStatus = "paid";
    } else if (saleDoc.paidAmount > 0) {
      saleDoc.paymentStatus = "partially_paid";
    } else {
      saleDoc.paymentStatus = "unpaid";
    }

    saleDoc.updatedBy = req.user._id;

    await saleDoc.save();

    const populatedItem =
      await SaleItem.findById(saleItem._id)
        .populate("business", "name")
        .populate(
          "sale",
          "saleNumber saleDate status totalAmount"
        )
        .populate(
          "product",
          "name sku barcode"
        )
        .populate(
          "productInventory",
          "color size quantity salePrice"
        )
        .populate(
          "createdBy",
          "name email"
        );

    return successResponse(
      res,
      201,
      "Sale item created successfully.",
      populatedItem
    );
  } catch (error) {
    next(error);
  }
};

/*
 * GET ALL SALE ITEMS
 */
export const getAllSaleItems = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        400,
        "Valid active business is required."
      );
    }

    const {
      page = 1,
      limit = 20,
      sale = "",
      product = "",
      productInventory = "",
    } = req.query;

    const currentPage = Math.max(
      Number(page),
      1
    );

    const currentLimit = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip =
      (currentPage - 1) *
      currentLimit;

    const filter = {
      business: businessId,
    };

    if (sale) {
      filter.sale = sale;
    }

    if (product) {
      filter.product = product;
    }

    if (productInventory) {
      filter.productInventory =
        productInventory;
    }

    const [items, total] =
      await Promise.all([
        SaleItem.find(filter)
          .populate(
            "sale",
            "saleNumber saleDate status"
          )
          .populate(
            "product",
            "name sku barcode"
          )
          .populate(
            "productInventory",
            "color size quantity salePrice"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(currentLimit),

        SaleItem.countDocuments(filter),
      ]);

    return successResponse(
      res,
      200,
      "Sale items fetched successfully.",
      {
        saleItems: items,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages: Math.ceil(
            total / currentLimit
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

/*
 * GET SALE ITEMS BY SALE
 */
export const getSaleItemsBySale = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        400,
        "Valid active business is required."
      );
    }

    const { saleId } = req.params;

    if (!isValidObjectId(saleId)) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    const sale = await Sale.findOne({
      _id: saleId,
      business: businessId,
    });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    const items = await SaleItem.find({
      business: businessId,
      sale: saleId,
    })
      .populate(
        "product",
        "name sku barcode"
      )
      .populate(
        "productInventory",
        "color size quantity salePrice"
      )
      .sort({ createdAt: 1 });

    return successResponse(
      res,
      200,
      "Sale items fetched successfully.",
      items
    );
  } catch (error) {
    next(error);
  }
};

/*
 * GET SALE ITEM BY ID
 */
export const getSaleItemById = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        400,
        "Valid active business is required."
      );
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const saleItem =
      await SaleItem.findOne({
        _id: id,
        business: businessId,
      })
        .populate("business", "name")
        .populate(
          "sale",
          "saleNumber saleDate status totalAmount"
        )
        .populate(
          "product",
          "name sku barcode"
        )
        .populate(
          "productInventory",
          "color size quantity salePrice"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    if (!saleItem) {
      return errorResponse(
        res,
        404,
        "Sale item not found."
      );
    }

    return successResponse(
      res,
      200,
      "Sale item fetched successfully.",
      saleItem
    );
  } catch (error) {
    next(error);
  }
};

/*
 * UPDATE SALE ITEM
 */
export const updateSaleItem = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        400,
        "Valid active business is required."
      );
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const saleItem =
      await SaleItem.findOne({
        _id: id,
        business: businessId,
      });

    if (!saleItem) {
      return errorResponse(
        res,
        404,
        "Sale item not found."
      );
    }

    const sale = await Sale.findOne({
      _id: saleItem.sale,
      business: businessId,
    });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Related sale not found."
      );
    }

    /*
     * Completed sales should not be edited.
     */
    if (
      [
        "completed",
        "partially_returned",
        "returned",
        "cancelled",
      ].includes(sale.status)
    ) {
      return errorResponse(
        res,
        400,
        "Sale items cannot be edited after the sale is finalized."
      );
    }

    const quantity =
      req.body.quantity ??
      saleItem.quantity;

    const product =
      req.body.product ??
      saleItem.product;

    const productInventory =
      req.body.productInventory ??
      saleItem.productInventory;

    /*
     * Validate product.
     */
    const productDoc = await Product.findOne({
      _id: product,
      business: businessId,
      isActive: true,
    });

    if (!productDoc) {
      return errorResponse(
        res,
        404,
        "Product not found for this business."
      );
    }

    /*
     * Validate inventory.
     */
    const inventory =
      await ProductInventory.findOne({
        _id: productInventory,
        business: businessId,
        product: product,
        isActive: true,
      });

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Product inventory variant not found."
      );
    }

    /*
     * During draft sale editing, stock is not
     * consumed yet.
     */
    if (quantity > inventory.quantity) {
      return errorResponse(
        res,
        400,
        `Insufficient stock. Available quantity is ${inventory.quantity}.`
      );
    }

    /*
     * Check duplicate variant if changed.
     */
    if (
      String(productInventory) !==
      String(saleItem.productInventory)
    ) {
      const duplicate =
        await SaleItem.findOne({
          sale: saleItem.sale,
          productInventory:
            productInventory,
          _id: { $ne: id },
        });

      if (duplicate) {
        return errorResponse(
          res,
          409,
          "This product inventory already exists in the sale."
        );
      }
    }

    const salePrice =
      req.body.salePrice ??
      saleItem.salePrice ??
      inventory.salePrice;

    const discount =
      req.body.discount ??
      saleItem.discount ??
      inventory.discount ??
      0;

    const tax =
      req.body.tax ??
      saleItem.tax ??
      inventory.tax ??
      0;

    const {
      lineSubtotal,
      lineTotal,
    } = calculateLineValues({
      quantity,
      salePrice,
      discount,
      tax,
    });

    saleItem.product = product;
    saleItem.productInventory =
      productInventory;
    saleItem.quantity = quantity;
    saleItem.salePrice = salePrice;
    saleItem.discount = discount;
    saleItem.tax = tax;
    saleItem.lineSubtotal =
      lineSubtotal;
    saleItem.lineTotal = lineTotal;
    saleItem.updatedBy = req.user._id;

    await saleItem.save();

    /*
     * Recalculate Sale totals.
     */
    const items = await SaleItem.find({
      sale: saleItem.sale,
      business: businessId,
    });

    const subtotal = items.reduce(
      (total, item) =>
        total + item.lineSubtotal,
      0
    );

    const itemDiscount = items.reduce(
      (total, item) =>
        total + item.discount,
      0
    );

    const itemTax = items.reduce(
      (total, item) =>
        total + item.tax,
      0
    );

    sale.subtotal = subtotal;
    sale.discount = itemDiscount;
    sale.tax = itemTax;

    sale.totalAmount =
      subtotal -
      itemDiscount +
      itemTax +
      sale.shippingCost +
      sale.otherCharges;

    sale.paidAmount = Math.min(
      sale.paidAmount,
      sale.totalAmount
    );

    sale.dueAmount =
      sale.totalAmount -
      sale.paidAmount;

    if (sale.dueAmount <= 0) {
      sale.paymentStatus = "paid";
    } else if (sale.paidAmount > 0) {
      sale.paymentStatus =
        "partially_paid";
    } else {
      sale.paymentStatus = "unpaid";
    }

    sale.updatedBy = req.user._id;

    await sale.save();

    const populatedItem =
      await SaleItem.findById(saleItem._id)
        .populate(
          "sale",
          "saleNumber saleDate status totalAmount"
        )
        .populate(
          "product",
          "name sku barcode"
        )
        .populate(
          "productInventory",
          "color size quantity salePrice"
        );

    return successResponse(
      res,
      200,
      "Sale item updated successfully.",
      populatedItem
    );
  } catch (error) {
    next(error);
  }
};

/*
 * DELETE SALE ITEM
 */
export const deleteSaleItem = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        400,
        "Valid active business is required."
      );
    }

    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const saleItem =
      await SaleItem.findOne({
        _id: id,
        business: businessId,
      });

    if (!saleItem) {
      return errorResponse(
        res,
        404,
        "Sale item not found."
      );
    }

    const sale = await Sale.findOne({
      _id: saleItem.sale,
      business: businessId,
    });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Related sale not found."
      );
    }

    if (
      [
        "completed",
        "partially_returned",
        "returned",
        "cancelled",
      ].includes(sale.status)
    ) {
      return errorResponse(
        res,
        400,
        "Sale items cannot be deleted after the sale is finalized."
      );
    }

    await SaleItem.deleteOne({
      _id: id,
      business: businessId,
    });

    /*
     * Recalculate Sale totals after deletion.
     */
    const items = await SaleItem.find({
      sale: sale._id,
      business: businessId,
    });

    const subtotal = items.reduce(
      (total, item) =>
        total + item.lineSubtotal,
      0
    );

    const itemDiscount = items.reduce(
      (total, item) =>
        total + item.discount,
      0
    );

    const itemTax = items.reduce(
      (total, item) =>
        total + item.tax,
      0
    );

    sale.subtotal = subtotal;
    sale.discount = itemDiscount;
    sale.tax = itemTax;

    sale.totalAmount =
      subtotal -
      itemDiscount +
      itemTax +
      sale.shippingCost +
      sale.otherCharges;

    sale.paidAmount = Math.min(
      sale.paidAmount,
      sale.totalAmount
    );

    sale.dueAmount =
      sale.totalAmount -
      sale.paidAmount;

    if (sale.dueAmount <= 0) {
      sale.paymentStatus = "paid";
    } else if (sale.paidAmount > 0) {
      sale.paymentStatus =
        "partially_paid";
    } else {
      sale.paymentStatus = "unpaid";
    }

    sale.updatedBy = req.user._id;

    await sale.save();

    return successResponse(
      res,
      200,
      "Sale item deleted successfully.",
      null
    );
  } catch (error) {
    next(error);
  }
};