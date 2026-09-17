import mongoose from "mongoose";

import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import User from "../models/User.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// ======================================================
// HELPERS
// ======================================================

const isValidObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

const getUserRole = (user) =>
  user?.role?.slug || user?.role?.name?.toLowerCase();

const isSuperAdmin = (user) =>
  getUserRole(user) === "super-admin";

const getEffectiveContext = async (user) => {
  if (!user) return null;

  if (user.business) {
    return {
      business: user.business?._id || user.business,
      businessType:
        user.businessType?._id || user.businessType || null,
    };
  }

  if (user.createdBy) {
    const creator = await User.findById(user.createdBy)
      .select("business businessType")
      .lean();

    if (!creator) return null;

    return {
      business: creator.business?._id || creator.business,
      businessType:
        creator.businessType?._id || creator.businessType || null,
    };
  }

  return null;
};

const parseNumber = (value, field) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    const error = new Error(`${field} must be a valid number.`);
    error.statusCode = 400;
    throw error;
  }

  return number;
};

const parseBoolean = (value) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;

  return undefined;
};

const normalizeVariant = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized || null;
};

const populateInventory = (query) =>
  query
    .populate({
      path: "product",
      select:
        "name sku barcode brand model category business businessType hasVariants",
    })
    .populate({
      path: "business",
      select: "name",
    })
    .populate({
      path: "createdBy",
      select: "name email",
    })
    .populate({
      path: "updatedBy",
      select: "name email",
    });

const getAllowedProductQuery = (context) => ({
  business: context.business,
  businessType: context.businessType,
});

const getAllowedProductIds = async (context, extraQuery = {}) => {
  return Product.distinct("_id", {
    ...getAllowedProductQuery(context),
    ...extraQuery,
  });
};

const getProductForUser = async (user, productId) => {
  if (!isValidObjectId(productId)) {
    return null;
  }

  const query = {
    _id: productId,
  };

  if (!isSuperAdmin(user)) {
    const context = await getEffectiveContext(user);

    if (!context?.business || !context?.businessType) {
      return null;
    }

    query.business = context.business;
    query.businessType = context.businessType;
  }

  return Product.findOne(query).lean();
};

const getInventoryForUser = async (user, id, isActive = true) => {
  if (!isValidObjectId(id)) {
    return null;
  }

  const query = {
    _id: id,
    isActive,
  };

  if (!isSuperAdmin(user)) {
    const context = await getEffectiveContext(user);

    if (!context?.business || !context?.businessType) {
      return null;
    }

    const productIds = await getAllowedProductIds(context);

    query.business = context.business;
    query.product = { $in: productIds };
  }

  return ProductInventory.findOne(query);
};

// ======================================================
// CREATE INVENTORY
// ======================================================

export const createProductInventory = async (req, res, next) => {
  try {
    const {
      product,
      color,
      size,
      quantity = 0,
      minStock = 0,
      maxStock = null,
      purchasePrice,
      salePrice,
      discount = 0,
      tax = 0,
    } = req.body;

    if (!product || !isValidObjectId(product)) {
      return errorResponse(
        res,
        400,
        "Valid product ID is required."
      );
    }

    const productData = await getProductForUser(
      req.user,
      product
    );

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    const businessId = productData.business;

    const normalizedColor = normalizeVariant(color);
    const normalizedSize = normalizeVariant(size);

    if (
      !productData.hasVariants &&
      (normalizedColor || normalizedSize)
    ) {
      return errorResponse(
        res,
        400,
        "This product does not support variants."
      );
    }

    const parsedQuantity =
      parseNumber(quantity, "Quantity") ?? 0;

    const parsedMinStock =
      parseNumber(minStock, "Minimum stock") ?? 0;

    const parsedMaxStock =
      parseNumber(maxStock, "Maximum stock");

    const parsedPurchasePrice =
      purchasePrice !== undefined
        ? parseNumber(purchasePrice, "Purchase price")
        : productData.purchasePrice ?? 0;

    const parsedSalePrice =
      salePrice !== undefined
        ? parseNumber(salePrice, "Sale price")
        : productData.salePrice ?? 0;

    const parsedDiscount =
      parseNumber(discount, "Discount") ?? 0;

    const parsedTax =
      parseNumber(tax, "Tax") ?? 0;

    if (parsedQuantity < 0) {
      return errorResponse(
        res,
        400,
        "Quantity cannot be negative."
      );
    }

    if (parsedMinStock < 0) {
      return errorResponse(
        res,
        400,
        "Minimum stock cannot be negative."
      );
    }

    if (
      parsedMaxStock !== undefined &&
      parsedMaxStock !== null &&
      parsedMaxStock < parsedMinStock
    ) {
      return errorResponse(
        res,
        400,
        "Maximum stock cannot be less than minimum stock."
      );
    }

    if (
      parsedPurchasePrice < 0 ||
      parsedSalePrice < 0
    ) {
      return errorResponse(
        res,
        400,
        "Prices cannot be negative."
      );
    }

    if (
      parsedDiscount < 0 ||
      parsedDiscount > 100
    ) {
      return errorResponse(
        res,
        400,
        "Discount must be between 0 and 100."
      );
    }

    if (parsedTax < 0) {
      return errorResponse(
        res,
        400,
        "Tax cannot be negative."
      );
    }

    const duplicate = await ProductInventory.findOne({
      business: businessId,
      product: productData._id,
      color: normalizedColor,
      size: normalizedSize,
      isActive: true,
    });

    if (duplicate) {
      return errorResponse(
        res,
        409,
        "This product inventory variant already exists."
      );
    }

    const inventory = await ProductInventory.create({
      business: businessId,
      product: productData._id,
      color: normalizedColor,
      size: normalizedSize,
      quantity: parsedQuantity,
      minStock: parsedMinStock,
      maxStock: parsedMaxStock ?? null,
      purchasePrice: parsedPurchasePrice ?? 0,
      salePrice: parsedSalePrice ?? 0,
      discount: parsedDiscount,
      tax: parsedTax,
      isActive: true,
      createdBy: req.user._id,
    });

    const result = await populateInventory(
      ProductInventory.findById(inventory._id)
    ).lean();

    return successResponse(
      res,
      201,
      "Product inventory created successfully.",
      result
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "This product inventory variant already exists."
      );
    }

    next(error);
  }
};

// ======================================================
// GET ALL INVENTORY
// ======================================================

export const getAllProductInventory = async (
  req,
  res,
  next
) => {
  try {
    const {
      product,
      business,
      businessType,
      color,
      size,
      stockStatus,
      search,
    } = req.query;

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );

    const query = {
      isActive: true,
    };

    let allowedProductQuery = {};

    // --------------------------------------------------
    // SUPER ADMIN
    // --------------------------------------------------

    if (isSuperAdmin(req.user)) {
      if (business) {
        if (!isValidObjectId(business)) {
          return errorResponse(
            res,
            400,
            "Invalid business ID."
          );
        }

        query.business = business;
        allowedProductQuery.business = business;
      }

      if (businessType) {
        if (!isValidObjectId(businessType)) {
          return errorResponse(
            res,
            400,
            "Invalid business type ID."
          );
        }

        allowedProductQuery.businessType = businessType;
      }
    } else {
      // ------------------------------------------------
      // ADMIN / MANAGER
      // ------------------------------------------------

      const context = await getEffectiveContext(req.user);

      if (!context?.business) {
        return errorResponse(
          res,
          403,
          "Business context not found."
        );
      }

      if (!context?.businessType) {
        return errorResponse(
          res,
          403,
          "Business type context not found."
        );
      }

      query.business = context.business;

      allowedProductQuery = {
        business: context.business,
        businessType: context.businessType,
      };
    }

    // --------------------------------------------------
    // PRODUCT FILTER
    // --------------------------------------------------

    if (product) {
      if (!isValidObjectId(product)) {
        return errorResponse(
          res,
          400,
          "Invalid product ID."
        );
      }

      const productQuery = {
        _id: product,
        ...allowedProductQuery,
      };

      const productData = await Product.findOne(productQuery)
        .select("_id")
        .lean();

      if (!productData) {
        return errorResponse(
          res,
          404,
          "Product not found or you do not have access to it."
        );
      }

      query.product = productData._id;
    } else if (
      Object.keys(allowedProductQuery).length
    ) {
      const productIds = await getAllowedProductIds(
        {
          business:
            allowedProductQuery.business,
          businessType:
            allowedProductQuery.businessType,
        }
      );

      if (!productIds.length) {
        return successResponse(
          res,
          200,
          "Product inventory fetched successfully.",
          {
            inventory: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
            },
          }
        );
      }

      query.product = {
        $in: productIds,
      };
    }

    // --------------------------------------------------
    // SEARCH
    // --------------------------------------------------

    if (search) {
      const searchValue = String(search).trim();

      if (searchValue) {
        const regex = new RegExp(
          searchValue.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          ),
          "i"
        );

        const searchProductQuery = {
          ...allowedProductQuery,
          $or: [
            { name: regex },
            { sku: regex },
            { barcode: regex },
          ],
        };

        const searchProductIds =
          await Product.distinct(
            "_id",
            searchProductQuery
          );

        if (!searchProductIds.length) {
          return successResponse(
            res,
            200,
            "Product inventory fetched successfully.",
            {
              inventory: [],
              pagination: {
                page,
                limit,
                total: 0,
                totalPages: 0,
              },
            }
          );
        }

        if (query.product?.$in) {
          const currentIds = new Set(
            query.product.$in.map((id) =>
              String(id)
            )
          );

          query.product = {
            $in: searchProductIds.filter((id) =>
              currentIds.has(String(id))
            ),
          };
        } else {
          query.product = {
            $in: searchProductIds,
          };
        }
      }
    }

    // --------------------------------------------------
    // OTHER FILTERS
    // --------------------------------------------------

    if (color) {
      query.color = String(color).trim();
    }

    if (size) {
      query.size = String(size).trim();
    }

    if (stockStatus === "out-of-stock") {
      query.quantity = 0;
    }

    if (stockStatus === "in-stock") {
      query.quantity = {
        $gt: 0,
      };
    }

    if (stockStatus === "low-stock") {
      query.quantity = {
        $gt: 0,
      };

      query.$expr = {
        $lte: ["$quantity", "$minStock"],
      };
    }

    // --------------------------------------------------
    // FETCH
    // --------------------------------------------------

    const total =
      await ProductInventory.countDocuments(query);

    const inventory = await populateInventory(
      ProductInventory.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ).lean();

    return successResponse(
      res,
      200,
      "Product inventory fetched successfully.",
      {
        inventory,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET INVENTORY BY PRODUCT
// ======================================================

export const getProductInventory = async (
  req,
  res,
  next
) => {
  try {
    const { productId } = req.params;

    if (!isValidObjectId(productId)) {
      return errorResponse(
        res,
        400,
        "Invalid product ID."
      );
    }

    const productData = await getProductForUser(
      req.user,
      productId
    );

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    const inventory = await populateInventory(
      ProductInventory.find({
        business: productData.business,
        product: productData._id,
        isActive: true,
      }).sort({ createdAt: -1 })
    ).lean();

    return successResponse(
      res,
      200,
      "Product inventory fetched successfully.",
      inventory
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET INVENTORY BY ID
// ======================================================

export const getProductInventoryById = async (
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
        "Invalid inventory ID."
      );
    }

    const inventory = await getInventoryForUser(
      req.user,
      id,
      true
    );

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    const result = await populateInventory(
      ProductInventory.findById(inventory._id)
    ).lean();

    return successResponse(
      res,
      200,
      "Product inventory fetched successfully.",
      result
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// UPDATE INVENTORY
// ======================================================

export const updateProductInventory = async (
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
        "Invalid inventory ID."
      );
    }

    const inventory = await getInventoryForUser(
      req.user,
      id,
      true
    );

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    const productData = await getProductForUser(
      req.user,
      inventory.product
    );

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    const color =
      req.body.color !== undefined
        ? normalizeVariant(req.body.color)
        : inventory.color;

    const size =
      req.body.size !== undefined
        ? normalizeVariant(req.body.size)
        : inventory.size;

    if (
      !productData.hasVariants &&
      (color || size)
    ) {
      return errorResponse(
        res,
        400,
        "This product does not support variants."
      );
    }

    const duplicate = await ProductInventory.findOne({
      _id: {
        $ne: inventory._id,
      },
      business: inventory.business,
      product: inventory.product,
      color,
      size,
      isActive: true,
    });

    if (duplicate) {
      return errorResponse(
        res,
        409,
        "Another active inventory variant already exists."
      );
    }

    if (req.body.quantity !== undefined) {
      const value = parseNumber(
        req.body.quantity,
        "Quantity"
      );

      if (value < 0) {
        return errorResponse(
          res,
          400,
          "Quantity cannot be negative."
        );
      }

      inventory.quantity = value;
    }

    if (req.body.minStock !== undefined) {
      const value = parseNumber(
        req.body.minStock,
        "Minimum stock"
      );

      if (value < 0) {
        return errorResponse(
          res,
          400,
          "Minimum stock cannot be negative."
        );
      }

      inventory.minStock = value;
    }

    if (req.body.maxStock !== undefined) {
      const value = parseNumber(
        req.body.maxStock,
        "Maximum stock"
      );

      if (
        value !== null &&
        value !== undefined &&
        value < 0
      ) {
        return errorResponse(
          res,
          400,
          "Maximum stock cannot be negative."
        );
      }

      inventory.maxStock = value;
    }

    if (
      inventory.maxStock !== null &&
      inventory.maxStock !== undefined &&
      inventory.maxStock < inventory.minStock
    ) {
      return errorResponse(
        res,
        400,
        "Maximum stock cannot be less than minimum stock."
      );
    }

    if (req.body.purchasePrice !== undefined) {
      const value = parseNumber(
        req.body.purchasePrice,
        "Purchase price"
      );

      if (value < 0) {
        return errorResponse(
          res,
          400,
          "Purchase price cannot be negative."
        );
      }

      inventory.purchasePrice = value;
    }

    if (req.body.salePrice !== undefined) {
      const value = parseNumber(
        req.body.salePrice,
        "Sale price"
      );

      if (value < 0) {
        return errorResponse(
          res,
          400,
          "Sale price cannot be negative."
        );
      }

      inventory.salePrice = value;
    }

    if (req.body.discount !== undefined) {
      const value = parseNumber(
        req.body.discount,
        "Discount"
      );

      if (value < 0 || value > 100) {
        return errorResponse(
          res,
          400,
          "Discount must be between 0 and 100."
        );
      }

      inventory.discount = value;
    }

    if (req.body.tax !== undefined) {
      const value = parseNumber(
        req.body.tax,
        "Tax"
      );

      if (value < 0) {
        return errorResponse(
          res,
          400,
          "Tax cannot be negative."
        );
      }

      inventory.tax = value;
    }

    if (req.body.isActive !== undefined) {
      const value = parseBoolean(
        req.body.isActive
      );

      if (value === undefined) {
        return errorResponse(
          res,
          400,
          "Invalid isActive value."
        );
      }

      inventory.isActive = value;
    }

    inventory.color = color;
    inventory.size = size;
    inventory.updatedBy = req.user._id;

    await inventory.save();

    const updatedInventory =
      await populateInventory(
        ProductInventory.findById(inventory._id)
      ).lean();

    return successResponse(
      res,
      200,
      "Product inventory updated successfully.",
      updatedInventory
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "Another active inventory variant already exists."
      );
    }

    next(error);
  }
};

// ======================================================
// UPDATE STOCK
// ======================================================

export const updateProductStock = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;
    const {
      quantity,
      operation = "set",
    } = req.body;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid inventory ID."
      );
    }

    const parsedQuantity = parseNumber(
      quantity,
      "Quantity"
    );

    if (
      parsedQuantity === undefined ||
      parsedQuantity < 0
    ) {
      return errorResponse(
        res,
        400,
        "Quantity must be a valid non-negative number."
      );
    }

    if (
      !["add", "subtract", "set"].includes(
        operation
      )
    ) {
      return errorResponse(
        res,
        400,
        "Operation must be add, subtract, or set."
      );
    }

    const inventory = await getInventoryForUser(
      req.user,
      id,
      true
    );

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    if (operation === "add") {
      inventory.quantity += parsedQuantity;
    }

    if (operation === "subtract") {
      if (parsedQuantity > inventory.quantity) {
        return errorResponse(
          res,
          400,
          "Insufficient stock."
        );
      }

      inventory.quantity -= parsedQuantity;
    }

    if (operation === "set") {
      inventory.quantity = parsedQuantity;
    }

    inventory.updatedBy = req.user._id;

    await inventory.save();

    const updatedInventory =
      await populateInventory(
        ProductInventory.findById(inventory._id)
      ).lean();

    return successResponse(
      res,
      200,
      "Product stock updated successfully.",
      updatedInventory
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// DELETE INVENTORY
// ======================================================

export const deleteProductInventory = async (
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
        "Invalid inventory ID."
      );
    }

    const inventory = await getInventoryForUser(
      req.user,
      id,
      true
    );

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    inventory.isActive = false;
    inventory.updatedBy = req.user._id;

    await inventory.save();

    return successResponse(
      res,
      200,
      "Product inventory deleted successfully."
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// RESTORE INVENTORY
// ======================================================

export const restoreProductInventory = async (
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
        "Invalid inventory ID."
      );
    }

    const inventory = await getInventoryForUser(
      req.user,
      id,
      false
    );

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Deleted inventory not found or you do not have access to it."
      );
    }

    const productData = await getProductForUser(
      req.user,
      inventory.product
    );

    if (!productData) {
      return errorResponse(
        res,
        403,
        "You do not have access to this product."
      );
    }

    const duplicate = await ProductInventory.findOne({
      _id: {
        $ne: inventory._id,
      },
      business: inventory.business,
      product: inventory.product,
      color: inventory.color,
      size: inventory.size,
      isActive: true,
    });

    if (duplicate) {
      return errorResponse(
        res,
        409,
        "An active inventory variant with the same color and size already exists."
      );
    }

    inventory.isActive = true;
    inventory.updatedBy = req.user._id;

    await inventory.save();

    const restoredInventory =
      await populateInventory(
        ProductInventory.findById(inventory._id)
      ).lean();

    return successResponse(
      res,
      200,
      "Product inventory restored successfully.",
      restoredInventory
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "An active inventory variant with the same color and size already exists."
      );
    }

    next(error);
  }
};