import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import BusinessType from "../models/BusinessType.js";
import User from "../models/User.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

import {
  getTenantContext,
  isValidObjectId,
} from "../utils/tenantContext.js";

// ======================================================
// HELPERS
// ======================================================

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
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeImei = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
};

const normalizeUnitBarcode = (value) => {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized || null;
};

const getRoleSlug = (user) => {
  if (!user) return null;

  if (user.role && typeof user.role === "object" && user.role.slug) {
    return user.role.slug.toLowerCase();
  }

  if (user.role && typeof user.role === "object" && user.role.name) {
    return user.role.name.toLowerCase();
  }

  if (user.role) {
    return String(user.role).toLowerCase();
  }

  return null;
};

const populateInventory = (query) => {
  return query
    .populate({
      path: "tenantOwner",
      select: "name email",
    })
    .populate({
      path: "product",
      select:
        "name sku barcode brand model category business businessType tenantOwner hasVariants trackSerial",
    })
    .populate({
      path: "business",
      select: "name",
    })
    .populate({
      path: "businessType",
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
};

// ======================================================
// RESOLVE TENANT
// ======================================================

const resolveTenant = async (req, requireOwner = false) => {
  const context = await getTenantContext(req);

  if (context.isSuperAdmin) {
    const requestedTenantOwner =
      req.body?.tenantOwner || req.query?.tenantOwner;

    if (!requestedTenantOwner) {
      if (requireOwner) {
        return { error: "Tenant owner is required." };
      }

      return {
        context,
        tenantOwner: null,
        business: null,
        businessType: null,
      };
    }

    if (!isValidObjectId(requestedTenantOwner)) {
      return { error: "Invalid tenant owner ID." };
    }

    const admin = await User.findOne({ _id: requestedTenantOwner })
      .select("_id role business businessType status")
      .populate({ path: "role", select: "slug" })
      .lean();

    if (!admin) {
      return { error: "Tenant owner not found." };
    }

    const roleSlug = getRoleSlug(admin);

    if (roleSlug !== "admin") {
      return { error: "Tenant owner must be an Admin." };
    }

    if (admin.status !== "active") {
      return { error: "Tenant owner account is not active." };
    }

    if (!admin.business || !admin.businessType) {
      return {
        error:
          "Tenant owner is not assigned to a business and business type.",
      };
    }

    return {
      context,
      tenantOwner: admin._id,
      business: admin.business,
      businessType: admin.businessType,
    };
  }

  if (!context.tenantOwner) {
    return { error: "Your account is not associated with a tenant." };
  }

  if (!context.business || !context.businessType) {
    return {
      error:
        "Your account is not associated with a business and business type.",
    };
  }

  return {
    context,
    tenantOwner: context.tenantOwner,
    business: context.business,
    businessType: context.businessType,
  };
};

// ======================================================
// GET PRODUCT FOR CURRENT USER
// ======================================================

const getProductForUser = async (req, productId) => {
  if (!isValidObjectId(productId)) return null;

  const context = await getTenantContext(req);

  const query = { _id: productId };

  if (!context.isSuperAdmin) {
    if (!context.tenantOwner) return null;

    query.tenantOwner = context.tenantOwner;

    if (context.business) {
      query.business = context.business;
    }

    if (context.businessType) {
      query.businessType = context.businessType;
    }
  }

  return Product.findOne(query).lean();
};

// ======================================================
// GET INVENTORY FOR CURRENT USER
// ======================================================

const getInventoryForUser = async (req, inventoryId, isActive = true) => {
  if (!isValidObjectId(inventoryId)) return null;

  const context = await getTenantContext(req);

  const query = {
    _id: inventoryId,
    isActive,
  };

  if (!context.isSuperAdmin) {
    if (!context.tenantOwner) return null;

    query.tenantOwner = context.tenantOwner;

    if (context.business) {
      query.business = context.business;
    }

    if (context.businessType) {
      query.businessType = context.businessType;
    }
  }

  return ProductInventory.findOne(query);
};

// ======================================================
// VALIDATE PRODUCT TENANT MATCH
// ======================================================

const validateProductTenant = (
  productData,
  tenantOwner,
  business,
  businessType
) => {
  if (!productData) return false;

  if (
    tenantOwner &&
    String(productData.tenantOwner) !== String(tenantOwner)
  ) {
    return false;
  }

  if (
    business &&
    String(productData.business) !== String(business)
  ) {
    return false;
  }

  if (
    businessType &&
    String(productData.businessType) !== String(businessType)
  ) {
    return false;
  }

  return true;
};

// ======================================================
// CHECK IF BUSINESS TYPE IS MOBILES
// ======================================================

const isMobilesBusinessType = async (businessTypeId) => {
  if (!businessTypeId) return false;

  const bt = await BusinessType.findById(businessTypeId)
    .select("name")
    .lean();

  if (!bt || !bt.name) return false;

  return bt.name.toLowerCase().trim() === "mobiles";
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
      imei,
      unitBarcode,
      serialNumber,
    } = req.body;

    if (!product || !isValidObjectId(product)) {
      return errorResponse(res, 400, "Valid product ID is required.");
    }

    const tenant = await resolveTenant(req, false);

    if (tenant.error) {
      return errorResponse(res, 400, tenant.error);
    }

    const productData = await getProductForUser(req, product);

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    const tenantOwner = tenant.context.isSuperAdmin
      ? productData.tenantOwner
      : tenant.tenantOwner;

    if (!tenantOwner) {
      return errorResponse(
        res,
        400,
        "Product is not associated with a tenant."
      );
    }

    const validProductTenant = validateProductTenant(
      productData,
      tenantOwner,
      productData.business,
      productData.businessType
    );

    if (!validProductTenant) {
      return errorResponse(
        res,
        403,
        "Product does not belong to this tenant."
      );
    }

    if (!productData.business || !productData.businessType) {
      return errorResponse(
        res,
        400,
        "Product is missing business or business type."
      );
    }

    const businessId = productData.business;
    const businessTypeId = productData.businessType;

    // --------------------------------------------------
    // Detect if this is a Mobiles business type
    // --------------------------------------------------
    const isMobiles = await isMobilesBusinessType(businessTypeId);

    const normalizedColor = normalizeVariant(color);
    const normalizedSize = normalizeVariant(size);
    const normalizedImei = normalizeImei(imei);
    const normalizedUnitBarcode = normalizeUnitBarcode(unitBarcode);
    const normalizedSerial = normalizeVariant(serialNumber);

    // --------------------------------------------------
    // IMEI validation for Mobiles
    // --------------------------------------------------
    if (isMobiles) {
      if (!normalizedImei) {
        return errorResponse(
          res,
          400,
          "IMEI number is required for mobile products."
        );
      }

      // For serial products quantity should normally be 1
      if (quantity !== undefined && Number(quantity) > 1) {
        return errorResponse(
          res,
          400,
          "For mobile products with IMEI, quantity must be 1."
        );
      }
    }

    // Non-variant products cannot have color/size
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
      isMobiles && normalizedImei
        ? 1
        : parseNumber(quantity, "Quantity") ?? 0;

    const parsedMinStock = parseNumber(minStock, "Minimum stock") ?? 0;
    const parsedMaxStock = parseNumber(maxStock, "Maximum stock");

    const parsedPurchasePrice =
      purchasePrice !== undefined
        ? parseNumber(purchasePrice, "Purchase price")
        : productData.purchasePrice ?? 0;

    const parsedSalePrice =
      salePrice !== undefined
        ? parseNumber(salePrice, "Sale price")
        : productData.salePrice ?? 0;

    const parsedDiscount = parseNumber(discount, "Discount") ?? 0;
    const parsedTax = parseNumber(tax, "Tax") ?? 0;

    if (parsedQuantity < 0) {
      return errorResponse(res, 400, "Quantity cannot be negative.");
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

    if (parsedPurchasePrice < 0 || parsedSalePrice < 0) {
      return errorResponse(res, 400, "Prices cannot be negative.");
    }

    if (parsedDiscount < 0 || parsedDiscount > 100) {
      return errorResponse(
        res,
        400,
        "Discount must be between 0 and 100."
      );
    }

    if (parsedTax < 0) {
      return errorResponse(res, 400, "Tax cannot be negative.");
    }

    // --------------------------------------------------
    // Duplicate checks
    // --------------------------------------------------

    // For non-serial (imei = null) → old color/size uniqueness
    if (!normalizedImei) {
      const duplicate = await ProductInventory.findOne({
        tenantOwner,
        product: productData._id,
        color: normalizedColor,
        size: normalizedSize,
        isActive: true,
        imei: null,
      });

      if (duplicate) {
        return errorResponse(
          res,
          409,
          "This product inventory variant already exists in this tenant."
        );
      }
    }

    // IMEI uniqueness
    if (normalizedImei) {
      const existingImei = await ProductInventory.findOne({
        tenantOwner,
        imei: normalizedImei,
      });

      if (existingImei) {
        return errorResponse(
          res,
          409,
          "This IMEI already exists in this tenant."
        );
      }
    }

    // Unit barcode uniqueness
    if (normalizedUnitBarcode) {
      const existingBarcode = await ProductInventory.findOne({
        tenantOwner,
        unitBarcode: normalizedUnitBarcode,
      });

      if (existingBarcode) {
        return errorResponse(
          res,
          409,
          "This unit barcode already exists in this tenant."
        );
      }
    }

    // --------------------------------------------------
    // CREATE
    // --------------------------------------------------
    const inventory = await ProductInventory.create({
      tenantOwner,
      business: businessId,
      businessType: businessTypeId,
      product: productData._id,
      color: normalizedColor,
      size: normalizedSize,
      imei: normalizedImei,
      unitBarcode: normalizedUnitBarcode,
      serialNumber: normalizedSerial,
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
    console.error("Create Product Inventory Error:", error);

    if (error.code === 11000) {
      // Detect which unique key failed
      const key = error.keyPattern || {};
      if (key.imei) {
        return errorResponse(
          res,
          409,
          "This IMEI already exists in this tenant."
        );
      }
      if (key.unitBarcode) {
        return errorResponse(
          res,
          409,
          "This unit barcode already exists in this tenant."
        );
      }
      return errorResponse(
        res,
        409,
        "This product inventory variant already exists in this tenant."
      );
    }

    next(error);
  }
};

// ======================================================
// GET ALL INVENTORY
// ======================================================

export const getAllProductInventory = async (req, res, next) => {
  try {
    const {
      product,
      business,
      businessType,
      color,
      size,
      stockStatus,
      search,
      imei,
      unitBarcode,
    } = req.query;

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const tenant = await resolveTenant(req, false);

    if (tenant.error) {
      return errorResponse(res, 400, tenant.error);
    }

    const query = {
      isActive: true,
    };

    if (!tenant.context.isSuperAdmin) {
      query.tenantOwner = tenant.tenantOwner;
      query.business = tenant.business;
      query.businessType = tenant.businessType;
    } else if (tenant.tenantOwner) {
      query.tenantOwner = tenant.tenantOwner;
      if (tenant.business) query.business = tenant.business;
      if (tenant.businessType) query.businessType = tenant.businessType;
    }

    if (tenant.context.isSuperAdmin && business) {
      if (!isValidObjectId(business)) {
        return errorResponse(res, 400, "Invalid business ID.");
      }
      query.business = business;
    }

    if (businessType) {
      if (!isValidObjectId(businessType)) {
        return errorResponse(res, 400, "Invalid business type ID.");
      }
      query.businessType = businessType;
    }

    if (product) {
      if (!isValidObjectId(product)) {
        return errorResponse(res, 400, "Invalid product ID.");
      }

      const productQuery = { _id: product };

      if (query.tenantOwner) productQuery.tenantOwner = query.tenantOwner;
      if (query.business) productQuery.business = query.business;
      if (query.businessType) productQuery.businessType = query.businessType;

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
    }

    // Search by product name / sku / barcode OR by IMEI / unitBarcode
    if (search?.trim()) {
      const searchValue = String(search).trim();
      const escapedSearch = searchValue.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );
      const regex = new RegExp(escapedSearch, "i");

      const searchProductQuery = {
        $or: [{ name: regex }, { sku: regex }, { barcode: regex }],
      };

      if (query.tenantOwner) {
        searchProductQuery.tenantOwner = query.tenantOwner;
      }
      if (query.business) {
        searchProductQuery.business = query.business;
      }
      if (query.businessType) {
        searchProductQuery.businessType = query.businessType;
      }

      const searchProductIds = await Product.distinct(
        "_id",
        searchProductQuery
      );

      // Also search directly on inventory IMEI / unitBarcode
      const inventorySearchOr = [
        { imei: regex },
        { unitBarcode: regex },
      ];

      if (searchProductIds.length) {
        query.$or = [
          { product: { $in: searchProductIds } },
          ...inventorySearchOr,
        ];
      } else {
        query.$or = inventorySearchOr;
      }
    }

    if (color) {
      query.color = String(color).trim();
    }

    if (size) {
      query.size = String(size).trim();
    }

    if (imei) {
      query.imei = String(imei).trim().toUpperCase();
    }

    if (unitBarcode) {
      query.unitBarcode = String(unitBarcode).trim().toUpperCase();
    }

    if (stockStatus === "out-of-stock") {
      query.quantity = 0;
    }

    if (stockStatus === "in-stock") {
      query.quantity = { $gt: 0 };
    }

    if (stockStatus === "low-stock") {
      query.quantity = { $gt: 0 };
      query.$expr = {
        $lte: ["$quantity", "$minStock"],
      };
    }

    if (
      stockStatus &&
      !["out-of-stock", "in-stock", "low-stock"].includes(stockStatus)
    ) {
      return errorResponse(res, 400, "Invalid stock status.");
    }

    const total = await ProductInventory.countDocuments(query);

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
    console.error("Get Product Inventory Error:", error);
    next(error);
  }
};

// ======================================================
// GET INVENTORY BY PRODUCT
// ======================================================

export const getProductInventory = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!isValidObjectId(productId)) {
      return errorResponse(res, 400, "Invalid product ID.");
    }

    const productData = await getProductForUser(req, productId);

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    const query = {
      tenantOwner: productData.tenantOwner,
      business: productData.business,
      businessType: productData.businessType,
      product: productData._id,
      isActive: true,
    };

    const inventory = await populateInventory(
      ProductInventory.find(query).sort({ createdAt: -1 })
    ).lean();

    return successResponse(
      res,
      200,
      "Product inventory fetched successfully.",
      inventory
    );
  } catch (error) {
    console.error("Get Product Inventory Error:", error);
    next(error);
  }
};

// ======================================================
// GET INVENTORY BY ID
// ======================================================

export const getProductInventoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid inventory ID.");
    }

    const inventory = await getInventoryForUser(req, id, true);

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    const productData = await getProductForUser(req, inventory.product);

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Related product not found or you do not have access to it."
      );
    }

    if (
      String(productData.tenantOwner) !== String(inventory.tenantOwner)
    ) {
      return errorResponse(
        res,
        403,
        "Inventory does not belong to the product tenant."
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
    console.error("Get Product Inventory By ID Error:", error);
    next(error);
  }
};

// ======================================================
// SCAN / LOOKUP BY IMEI OR UNIT BARCODE  (NEW)
// ======================================================

export const scanProductInventory = async (req, res, next) => {
  try {
    const { code } = req.query; // can be IMEI or unitBarcode

    if (!code || !String(code).trim()) {
      return errorResponse(
        res,
        400,
        "Scan code (IMEI or unit barcode) is required."
      );
    }

    const normalizedCode = String(code).trim().toUpperCase();

    const tenant = await resolveTenant(req, false);

    if (tenant.error) {
      return errorResponse(res, 400, tenant.error);
    }

    const query = {
      isActive: true,
      $or: [
        { imei: normalizedCode },
        { unitBarcode: normalizedCode },
      ],
    };

    if (!tenant.context.isSuperAdmin) {
      query.tenantOwner = tenant.tenantOwner;
      query.business = tenant.business;
      query.businessType = tenant.businessType;
    } else if (tenant.tenantOwner) {
      query.tenantOwner = tenant.tenantOwner;
      if (tenant.business) query.business = tenant.business;
      if (tenant.businessType) query.businessType = tenant.businessType;
    }

    const inventory = await populateInventory(
      ProductInventory.findOne(query)
    ).lean();

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "No inventory found for this IMEI or unit barcode."
      );
    }

    return successResponse(
      res,
      200,
      "Inventory found successfully.",
      inventory
    );
  } catch (error) {
    console.error("Scan Product Inventory Error:", error);
    next(error);
  }
};

// ======================================================
// UPDATE INVENTORY
// ======================================================

export const updateProductInventory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid inventory ID.");
    }

    const inventory = await getInventoryForUser(req, id, true);

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    const productData = await getProductForUser(req, inventory.product);

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    if (
      String(inventory.tenantOwner) !== String(productData.tenantOwner)
    ) {
      return errorResponse(
        res,
        403,
        "Inventory does not belong to the product tenant."
      );
    }

    if (String(inventory.business) !== String(productData.business)) {
      return errorResponse(
        res,
        403,
        "Inventory business does not match the product business."
      );
    }

    if (
      inventory.businessType &&
      String(inventory.businessType) !== String(productData.businessType)
    ) {
      return errorResponse(
        res,
        403,
        "Inventory business type does not match the product business type."
      );
    }

    // Keep businessType in sync with product if missing on older docs
    if (!inventory.businessType && productData.businessType) {
      inventory.businessType = productData.businessType;
    }

    const isMobiles = await isMobilesBusinessType(
      inventory.businessType || productData.businessType
    );

    const color =
      req.body.color !== undefined
        ? normalizeVariant(req.body.color)
        : inventory.color;

    const size =
      req.body.size !== undefined
        ? normalizeVariant(req.body.size)
        : inventory.size;

    const normalizedImei =
      req.body.imei !== undefined
        ? normalizeImei(req.body.imei)
        : inventory.imei;

    const normalizedUnitBarcode =
      req.body.unitBarcode !== undefined
        ? normalizeUnitBarcode(req.body.unitBarcode)
        : inventory.unitBarcode;

    const normalizedSerial =
      req.body.serialNumber !== undefined
        ? normalizeVariant(req.body.serialNumber)
        : inventory.serialNumber;

    if (!productData.hasVariants && (color || size)) {
      return errorResponse(
        res,
        400,
        "This product does not support variants."
      );
    }

    // IMEI required for Mobiles
    if (isMobiles && !normalizedImei) {
      return errorResponse(
        res,
        400,
        "IMEI number is required for mobile products."
      );
    }

    // Prevent changing IMEI if quantity is already 0 (sold)
    if (
      inventory.imei &&
      normalizedImei !== inventory.imei &&
      inventory.quantity === 0
    ) {
      return errorResponse(
        res,
        400,
        "Cannot change IMEI of a sold unit."
      );
    }

    // Duplicate color/size only for non-serial
    if (!normalizedImei) {
      const duplicate = await ProductInventory.findOne({
        _id: { $ne: inventory._id },
        tenantOwner: inventory.tenantOwner,
        product: inventory.product,
        color,
        size,
        isActive: true,
        imei: null,
      });

      if (duplicate) {
        return errorResponse(
          res,
          409,
          "Another active inventory variant already exists in this tenant."
        );
      }
    }

    // IMEI uniqueness
    if (normalizedImei && normalizedImei !== inventory.imei) {
      const existingImei = await ProductInventory.findOne({
        _id: { $ne: inventory._id },
        tenantOwner: inventory.tenantOwner,
        imei: normalizedImei,
      });

      if (existingImei) {
        return errorResponse(
          res,
          409,
          "This IMEI already exists in this tenant."
        );
      }
    }

    // Unit barcode uniqueness
    if (
      normalizedUnitBarcode &&
      normalizedUnitBarcode !== inventory.unitBarcode
    ) {
      const existingBarcode = await ProductInventory.findOne({
        _id: { $ne: inventory._id },
        tenantOwner: inventory.tenantOwner,
        unitBarcode: normalizedUnitBarcode,
      });

      if (existingBarcode) {
        return errorResponse(
          res,
          409,
          "This unit barcode already exists in this tenant."
        );
      }
    }

    if (req.body.quantity !== undefined) {
      const value = parseNumber(req.body.quantity, "Quantity");
      if (value < 0) {
        return errorResponse(res, 400, "Quantity cannot be negative.");
      }

      // For mobiles with IMEI force quantity = 1
      if (isMobiles && normalizedImei && value > 1) {
        return errorResponse(
          res,
          400,
          "For mobile products with IMEI, quantity must be 1."
        );
      }

      inventory.quantity = value;
    }

    if (req.body.minStock !== undefined) {
      const value = parseNumber(req.body.minStock, "Minimum stock");
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
      const value = parseNumber(req.body.maxStock, "Maximum stock");
      if (value !== null && value !== undefined && value < 0) {
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
      const value = parseNumber(req.body.purchasePrice, "Purchase price");
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
      const value = parseNumber(req.body.salePrice, "Sale price");
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
      const value = parseNumber(req.body.discount, "Discount");
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
      const value = parseNumber(req.body.tax, "Tax");
      if (value < 0) {
        return errorResponse(res, 400, "Tax cannot be negative.");
      }
      inventory.tax = value;
    }

    if (req.body.isActive !== undefined) {
      const value = parseBoolean(req.body.isActive);
      if (value === undefined) {
        return errorResponse(res, 400, "Invalid isActive value.");
      }
      inventory.isActive = value;
    }

    inventory.color = color;
    inventory.size = size;
    inventory.imei = normalizedImei;
    inventory.unitBarcode = normalizedUnitBarcode;
    inventory.serialNumber = normalizedSerial;
    inventory.updatedBy = req.user._id;

    await inventory.save();

    const updatedInventory = await populateInventory(
      ProductInventory.findById(inventory._id)
    ).lean();

    return successResponse(
      res,
      200,
      "Product inventory updated successfully.",
      updatedInventory
    );
  } catch (error) {
    console.error("Update Product Inventory Error:", error);

    if (error.code === 11000) {
      const key = error.keyPattern || {};
      if (key.imei) {
        return errorResponse(
          res,
          409,
          "This IMEI already exists in this tenant."
        );
      }
      if (key.unitBarcode) {
        return errorResponse(
          res,
          409,
          "This unit barcode already exists in this tenant."
        );
      }
      return errorResponse(
        res,
        409,
        "Another active inventory variant already exists in this tenant."
      );
    }

    next(error);
  }
};

// ======================================================
// UPDATE STOCK
// ======================================================

export const updateProductStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { quantity, operation = "set" } = req.body;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid inventory ID.");
    }

    const parsedQuantity = parseNumber(quantity, "Quantity");

    if (parsedQuantity === undefined || parsedQuantity < 0) {
      return errorResponse(
        res,
        400,
        "Quantity must be a valid non-negative number."
      );
    }

    if (!["add", "subtract", "set"].includes(operation)) {
      return errorResponse(
        res,
        400,
        "Operation must be add, subtract, or set."
      );
    }

    const inventory = await getInventoryForUser(req, id, true);

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Inventory not found or you do not have access to it."
      );
    }

    const productData = await getProductForUser(req, inventory.product);

    if (!productData) {
      return errorResponse(
        res,
        404,
        "Product not found or you do not have access to it."
      );
    }

    if (
      String(inventory.tenantOwner) !== String(productData.tenantOwner)
    ) {
      return errorResponse(
        res,
        403,
        "Inventory does not belong to the product tenant."
      );
    }

    // For mobiles with IMEI we normally keep quantity 0 or 1
    const isMobiles = await isMobilesBusinessType(
      inventory.businessType || productData.businessType
    );

    if (operation === "add") {
      inventory.quantity += parsedQuantity;
    }

    if (operation === "subtract") {
      if (parsedQuantity > inventory.quantity) {
        return errorResponse(res, 400, "Insufficient stock.");
      }
      inventory.quantity -= parsedQuantity;
    }

    if (operation === "set") {
      inventory.quantity = parsedQuantity;
    }

    if (isMobiles && inventory.imei && inventory.quantity > 1) {
      return errorResponse(
        res,
        400,
        "For mobile products with IMEI, quantity cannot be greater than 1."
      );
    }

    inventory.updatedBy = req.user._id;
    await inventory.save();

    const updatedInventory = await populateInventory(
      ProductInventory.findById(inventory._id)
    ).lean();

    return successResponse(
      res,
      200,
      "Product stock updated successfully.",
      updatedInventory
    );
  } catch (error) {
    console.error("Update Product Stock Error:", error);
    next(error);
  }
};

// ======================================================
// DELETE INVENTORY
// ======================================================

export const deleteProductInventory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid inventory ID.");
    }

    const inventory = await getInventoryForUser(req, id, true);

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
    console.error("Delete Product Inventory Error:", error);
    next(error);
  }
};

// ======================================================
// RESTORE INVENTORY
// ======================================================

export const restoreProductInventory = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid inventory ID.");
    }

    const inventory = await getInventoryForUser(req, id, false);

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Deleted inventory not found or you do not have access to it."
      );
    }

    const productData = await getProductForUser(req, inventory.product);

    if (!productData) {
      return errorResponse(
        res,
        403,
        "You do not have access to this product."
      );
    }

    if (
      String(inventory.tenantOwner) !== String(productData.tenantOwner)
    ) {
      return errorResponse(
        res,
        403,
        "Inventory does not belong to the product tenant."
      );
    }

    if (String(inventory.business) !== String(productData.business)) {
      return errorResponse(
        res,
        403,
        "Inventory business does not match the product business."
      );
    }

    if (!inventory.businessType && productData.businessType) {
      inventory.businessType = productData.businessType;
    }

    // Duplicate checks on restore
    if (!inventory.imei) {
      const duplicate = await ProductInventory.findOne({
        _id: { $ne: inventory._id },
        tenantOwner: inventory.tenantOwner,
        product: inventory.product,
        color: inventory.color,
        size: inventory.size,
        isActive: true,
        imei: null,
      });

      if (duplicate) {
        return errorResponse(
          res,
          409,
          "An active inventory variant with the same color and size already exists in this tenant."
        );
      }
    }

    if (inventory.imei) {
      const existingImei = await ProductInventory.findOne({
        _id: { $ne: inventory._id },
        tenantOwner: inventory.tenantOwner,
        imei: inventory.imei,
        isActive: true,
      });

      if (existingImei) {
        return errorResponse(
          res,
          409,
          "An active inventory with the same IMEI already exists in this tenant."
        );
      }
    }

    inventory.isActive = true;
    inventory.updatedBy = req.user._id;
    await inventory.save();

    const restoredInventory = await populateInventory(
      ProductInventory.findById(inventory._id)
    ).lean();

    return successResponse(
      res,
      200,
      "Product inventory restored successfully.",
      restoredInventory
    );
  } catch (error) {
    console.error("Restore Product Inventory Error:", error);

    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "An active inventory variant with the same color and size already exists in this tenant."
      );
    }

    next(error);
  }
};