import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import InventoryUnit from "../models/InventoryUnit.js";

import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";
import Brand from "../models/Brand.js";
import Model from "../models/Model.js";
import Category from "../models/Category.js";
import User from "../models/User.js";

import {
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinaryUpload.js";

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

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "1"].includes(String(value).toLowerCase());
};

// ======================================================
// TITLE CASE
// ======================================================

const normalizeTitleCase = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// ======================================================
// BARCODE
// ======================================================

const normalizeBarcode = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const barcode = String(value).trim();

  return barcode || null;
};

// ======================================================
// SLUG
// ======================================================

const makeSlug = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ======================================================
// POPULATE PRODUCT
// ======================================================

const populateProduct = (query) =>
  query
    .populate("tenantOwner", "name email")
    .populate("business", "name")
    .populate("businessType", "name")
    .populate("category", "name slug")
    .populate("brand", "name")
    .populate("model", "name")
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

// ======================================================
// RESOLVE TENANT
// ======================================================

const resolveTenant = async (req, requireOwner = true) => {
  const context = await getTenantContext(req);

  // ====================================================
  // SUPER ADMIN
  // ====================================================

  if (context.isSuperAdmin) {
    const requestedTenantOwner =
      req.body?.tenantOwner || req.query?.tenantOwner;

    if (requireOwner && !requestedTenantOwner) {
      return {
        error: "Tenant owner is required.",
      };
    }

    if (
      requestedTenantOwner &&
      !isValidObjectId(requestedTenantOwner)
    ) {
      return {
        error: "Invalid tenant owner ID.",
      };
    }

    if (!requestedTenantOwner) {
      return {
        context,
        tenantOwner: null,
        business:
          req.body?.business ||
          req.query?.business ||
          null,
        businessType:
          req.body?.businessType ||
          req.query?.businessType ||
          null,
      };
    }

    const admin = await User.findById(requestedTenantOwner)
      .select("_id role business businessType status")
      .populate("role", "slug");

    if (!admin) {
      return {
        error: "Tenant owner not found.",
      };
    }

    const roleSlug = admin.role?.slug?.toLowerCase();

    if (roleSlug !== "admin") {
      return {
        error: "Tenant owner must be an Admin.",
      };
    }

    if (admin.status !== "active") {
      return {
        error: "Tenant owner account is not active.",
      };
    }

    if (!admin.business) {
      return {
        error: "Tenant owner is not assigned to a business.",
      };
    }

    if (!admin.businessType) {
      return {
        error:
          "Tenant owner is not assigned to a business type.",
      };
    }

    return {
      context,
      tenantOwner: admin._id,
      business: admin.business,
      businessType: admin.businessType,
    };
  }

  // ====================================================
  // ADMIN / MANAGER
  // ====================================================

  if (!context.tenantOwner) {
    return {
      error:
        "Your account is not associated with a tenant.",
    };
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
// RELATION VALIDATORS
// ======================================================

const validateBusiness = (id) =>
  isValidObjectId(id)
    ? Business.findOne({
        _id: id,
        isActive: true,
      })
    : null;

const validateBusinessType = (id, businessId) =>
  isValidObjectId(id) && isValidObjectId(businessId)
    ? BusinessType.findOne({
        _id: id,
        business: businessId,
        isActive: true,
      })
    : null;

const validateCategory = (
  id,
  tenantOwner,
  businessId,
  businessTypeId
) =>
  isValidObjectId(id) &&
  tenantOwner &&
  businessId &&
  businessTypeId
    ? Category.findOne({
        _id: id,
        tenantOwner,
        business: businessId,
        isActive: true,
        $or: [
          {
            businessType: businessTypeId,
          },
          {
            businessType: null,
          },
        ],
      })
    : null;

const validateBrand = (
  id,
  businessId,
  businessTypeId
) =>
  isValidObjectId(id) &&
  isValidObjectId(businessId) &&
  isValidObjectId(businessTypeId)
    ? Brand.findOne({
        _id: id,
        business: businessId,
        businessType: businessTypeId,
        isActive: true,
      })
    : null;

const validateModel = async (
  id,
  businessId,
  businessTypeId,
  brandId
) => {
  if (!id) {
    return null;
  }

  if (!isValidObjectId(id)) {
    return false;
  }

  if (
    !isValidObjectId(businessId) ||
    !isValidObjectId(businessTypeId) ||
    !isValidObjectId(brandId)
  ) {
    return null;
  }

  return Model.findOne({
    _id: id,
    business: businessId,
    businessType: businessTypeId,
    brand: brandId,
    isActive: true,
  });
};

// ======================================================
// GENERATE UNIQUE SLUG
// ======================================================
//
// Example:
//
// Samsung Galaxy S20
// samsung-galaxy-s20
//
// If it already exists:
//
// samsung-galaxy-s20-2
// samsung-galaxy-s20-3
//
// Uniqueness is tenant scoped.
// ======================================================

const generateUniqueSlug = async (
  name,
  tenantOwner,
  excludeProductId = null
) => {
  const baseSlug = makeSlug(name);

  if (!baseSlug) {
    return null;
  }

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = {
      tenantOwner,
      slug,
    };

    if (excludeProductId) {
      query._id = {
        $ne: excludeProductId,
      };
    }

    const exists = await Product.exists(query);

    if (!exists) {
      return slug;
    }

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
};

// ======================================================
// GENERATE SKU
// ======================================================
//
// SKU is generated automatically.
//
// Example:
//
// SAMSUNG-S20-000001
// SAMSUNG-S20-000002
//
// Sequence is tenant scoped.
//
// Admin A:
// SAMSUNG-S20-000001
//
// Admin B:
// SAMSUNG-S20-000001
//
// Different tenants do not conflict.
// ======================================================

const generateSku = async (
  tenantOwner,
  brandName,
  modelName,
  productName
) => {
  const brandPart = makeSlug(brandName)
    .replace(/-/g, "")
    .toUpperCase()
    .slice(0, 20);

  const modelPart = makeSlug(
    modelName || productName
  )
    .replace(/-/g, "")
    .toUpperCase()
    .slice(0, 30);

  const prefix = `${brandPart || "PRODUCT"}-${modelPart || "ITEM"}`;



  const number = String(sequence.counter).padStart(6, "0");

  return `${prefix}-${number}`;
};

// ======================================================
// DUPLICATE ERROR
// ======================================================

const handleDuplicateError = (error, res) => {
  if (error?.code !== 11000) {
    return false;
  }

  const keys = Object.keys(error.keyPattern || {});

  if (keys.includes("sku")) {
    return errorResponse(
      res,
      409,
      "Generated SKU already exists. Please try again."
    );
  }

  if (keys.includes("slug")) {
    return errorResponse(
      res,
      409,
      "Generated product slug already exists. Please try again."
    );
  }

  if (keys.includes("barcode")) {
    return errorResponse(
      res,
      409,
      "A product with this barcode already exists in this tenant."
    );
  }

  return errorResponse(
    res,
    409,
    "A product with the same unique value already exists."
  );
};

// ======================================================
// CREATE PRODUCT
// ======================================================

export const createProduct = async (req, res) => {
  const uploadedImages = [];

  try {
    const tenant = await resolveTenant(req, true);

    if (tenant.error) {
      return errorResponse(res, 400, tenant.error);
    }

    const {
      category,
      brand,
      model,
      name,
      barcode,
      barcodeType,
      shortDescription,
      description,
      productType = "simple",
      unit = "piece",
      hasVariants,
      isFeatured,
      isActive,
      trackSerial,
    } = req.body;

    const {
      tenantOwner,
      business,
      businessType,
    } = tenant;

    // ==================================================
    // BASIC REQUIRED VALUES
    // ==================================================

    if (!category) {
      return errorResponse(
        res,
        400,
        "Category is required."
      );
    }

    if (!brand) {
      return errorResponse(
        res,
        400,
        "Brand is required."
      );
    }

    if (!name?.trim()) {
      return errorResponse(
        res,
        400,
        "Product name is required."
      );
    }

    // ==================================================
    // VALIDATE BUSINESS
    // ==================================================

    const businessDoc = await validateBusiness(business);

    if (!businessDoc) {
      return errorResponse(
        res,
        400,
        "Business not found or inactive."
      );
    }

    // ==================================================
    // VALIDATE BUSINESS TYPE
    // ==================================================

    const businessTypeDoc =
      await validateBusinessType(
        businessType,
        business
      );

    if (!businessTypeDoc) {
      return errorResponse(
        res,
        400,
        "Business type not found or does not belong to this business."
      );
    }

    // ==================================================
    // VALIDATE CATEGORY
    // ==================================================

    const categoryDoc = await validateCategory(
      category,
      tenantOwner,
      business,
      businessType
    );

    if (!categoryDoc) {
      return errorResponse(
        res,
        400,
        "Category not found or does not belong to this tenant."
      );
    }

    // ==================================================
    // VALIDATE BRAND
    // ==================================================

    const brandDoc = await validateBrand(
      brand,
      business,
      businessType
    );

    if (!brandDoc) {
      return errorResponse(
        res,
        400,
        "Brand not found or does not belong to the selected business type."
      );
    }

    // ==================================================
    // VALIDATE MODEL
    // ==================================================

    const modelDoc = await validateModel(
      model,
      business,
      businessType,
      brand
    );

    if (model && modelDoc === false) {
      return errorResponse(
        res,
        400,
        "Invalid model ID."
      );
    }

    if (model && !modelDoc) {
      return errorResponse(
        res,
        400,
        "Model not found or does not belong to the selected brand and business type."
      );
    }

    // ==================================================
    // PRODUCT TYPE / VARIANTS
    // ==================================================

    const parsedHasVariants = parseBoolean(
      hasVariants,
      productType === "variable"
    );

    if (
      productType === "simple" &&
      parsedHasVariants
    ) {
      return errorResponse(
        res,
        400,
        "A simple product cannot have variants."
      );
    }

    if (
      productType === "variable" &&
      !parsedHasVariants
    ) {
      return errorResponse(
        res,
        400,
        "A variable product must have variants."
      );
    }

    // ==================================================
    // MOBILE SERIAL TRACKING
    // ==================================================

    const isMobiles =
      businessTypeDoc.name
        ?.toLowerCase()
        .trim() === "mobiles";

    const parsedTrackSerial = parseBoolean(
      trackSerial,
      isMobiles
    );

    // ==================================================
    // NORMALIZE PRODUCT NAME
    // ==================================================

    const productName = normalizeTitleCase(
      name
    );

    // ==================================================
    // GENERATE SLUG
    // ==================================================

    const productSlug =
      await generateUniqueSlug(
        productName,
        tenantOwner
      );

    // ==================================================
    // GENERATE SKU
    // ==================================================

    const productSku = await generateSku(
      tenantOwner,
      brandDoc.name,
      modelDoc?.name,
      productName
    );

    // ==================================================
    // BARCODE
    // ==================================================

    const normalizedBarcode =
      normalizeBarcode(barcode);

    if (normalizedBarcode) {
      const existingBarcode =
        await Product.findOne({
          tenantOwner,
          barcode: normalizedBarcode,
        }).select("_id");

      if (existingBarcode) {
        return errorResponse(
          res,
          409,
          "A product with this barcode already exists in this tenant."
        );
      }
    }

    // ==================================================
    // IMAGES
    // ==================================================

    if (req.files?.length) {
      for (const file of req.files) {
        const result =
          await uploadToCloudinary(
            file.buffer,
            "pos/products"
          );

        uploadedImages.push({
          url: result.secure_url,
          publicId: result.public_id,
          assetId:
            result.asset_id || null,
        });
      }
    }

    // ==================================================
    // CREATE PRODUCT
    // ==================================================

    const product = await Product.create({
      tenantOwner,
      business,
      businessType,

      category: categoryDoc._id,
      brand: brandDoc._id,
      model: modelDoc?._id || null,

      name: productName,

      slug: productSlug,
      sku: productSku,

      barcode: normalizedBarcode,

      barcodeType: normalizedBarcode
        ? barcodeType || "CUSTOM"
        : "CUSTOM",

      shortDescription:
        shortDescription
          ? normalizeTitleCase(shortDescription)
          : "",

      description:
        description?.trim() || "",

      images: uploadedImages,

      productType,

      hasVariants: parsedHasVariants,

      trackSerial: parsedTrackSerial,

      unit,

      isFeatured: parseBoolean(
        isFeatured,
        false
      ),

      isActive: parseBoolean(
        isActive,
        true
      ),

      createdBy: req.user._id,
    });

    // ==================================================
    // NO INVENTORY CREATED HERE
    // ==================================================
    //
    // ProductInventory is created separately.
    //
    // Product = master information
    // ProductInventory = stock + pricing
    // InventoryUnit = physical serialized unit
    // ==================================================

    const populated =
      await populateProduct(
        Product.findById(product._id)
      );

    return successResponse(
      res,
      201,
      "Product created successfully.",
      populated
    );
  } catch (error) {
    console.error(
      "Create Product Error:",
      error
    );

    // ==================================================
    // CLOUDINARY CLEANUP
    // ==================================================

    for (const image of uploadedImages) {
      if (image?.publicId) {
        try {
          await deleteFromCloudinary(
            image.publicId
          );
        } catch {}
      }
    }

    if (handleDuplicateError(error, res)) {
      return;
    }

    return errorResponse(
      res,
      500,
      error.message ||
        "Failed to create product."
    );
  }
};

// ======================================================
// GET ALL PRODUCTS
// ======================================================

export const getAllProducts = async (
  req,
  res
) => {
  try {
    const tenant = await resolveTenant(
      req,
      false
    );

    if (tenant.error) {
      return errorResponse(
        res,
        400,
        tenant.error
      );
    }

    const {
      tenantOwner,
      business,
      businessType,
      context,
    } = tenant;

    const {
      page = 1,
      limit = 20,
      search,
      category,
      brand,
      model,
      productType,
      isActive,
      stockStatus,
      trackSerial,
    } = req.query;

    const query = {};

    // ==================================================
    // TENANT ISOLATION
    // ==================================================

    if (!context.isSuperAdmin) {
      query.tenantOwner = tenantOwner;
      query.business = business;
      query.businessType = businessType;
    } else if (tenantOwner) {
      query.tenantOwner = tenantOwner;

      if (business) {
        query.business = business;
      }

      if (businessType) {
        query.businessType = businessType;
      }
    }

    // ==================================================
    // SEARCH
    // ==================================================

    if (search?.trim()) {
      const value = search.trim();

      query.$or = [
        {
          name: {
            $regex: value,
            $options: "i",
          },
        },
        {
          sku: {
            $regex: value,
            $options: "i",
          },
        },
        {
          slug: {
            $regex: value,
            $options: "i",
          },
        },
        {
          barcode: {
            $regex: value,
            $options: "i",
          },
        },
      ];
    }

    // ==================================================
    // FILTERS
    // ==================================================

    for (const [field, value] of [
      ["category", category],
      ["brand", brand],
      ["model", model],
    ]) {
      if (value) {
        if (!isValidObjectId(value)) {
          return errorResponse(
            res,
            400,
            `Invalid ${field} ID.`
          );
        }

        query[field] = value;
      }
    }

    // ==================================================
    // PRODUCT TYPE
    // ==================================================

    if (productType) {
      query.productType = productType;
    }

    // ==================================================
    // STATUS
    // ==================================================

    if (isActive !== undefined) {
      query.isActive = parseBoolean(
        isActive
      );
    }

    // ==================================================
    // SERIAL TRACKING
    // ==================================================

    if (trackSerial !== undefined) {
      query.trackSerial = parseBoolean(
        trackSerial
      );
    }

    // ==================================================
    // PAGINATION
    // ==================================================

    const pageNumber = Math.max(
      Number(page) || 1,
      1
    );

    const limitNumber = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (pageNumber - 1) *
      limitNumber;

    const [
      products,
      total,
    ] = await Promise.all([
      populateProduct(
        Product.find(query)
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limitNumber)
      ),

      Product.countDocuments(query),
    ]);

    // ==================================================
    // STOCK STATUS
    // ==================================================
    //
    // ProductInventory should be used for actual stock.
    //
    // This controller does not apply stockStatus yet.
    // ==================================================

    if (stockStatus) {
      const allowedStatuses = [
        "out-of-stock",
        "low-stock",
        "in-stock",
      ];

      if (
        !allowedStatuses.includes(
          stockStatus
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid stock status."
        );
      }
    }

    return successResponse(
      res,
      200,
      "Products fetched successfully.",
      {
        products,
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
      "Get All Products Error:",
      error
    );

    return errorResponse(
      res,
      500,
      error.message ||
        "Failed to fetch products."
    );
  }
};

// ======================================================
// GET PRODUCT BY ID
// ======================================================

export const getProductById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid product ID."
      );
    }

    const tenant = await resolveTenant(
      req,
      false
    );

    if (tenant.error) {
      return errorResponse(
        res,
        400,
        tenant.error
      );
    }

    const query = {
      _id: id,
    };

    if (tenant.tenantOwner) {
      query.tenantOwner =
        tenant.tenantOwner;
    }

    if (tenant.business) {
      query.business =
        tenant.business;
    }

    if (tenant.businessType) {
      query.businessType =
        tenant.businessType;
    }

    const product =
      await populateProduct(
        Product.findOne(query)
      );

    if (!product) {
      return errorResponse(
        res,
        404,
        "Product not found."
      );
    }

    return successResponse(
      res,
      200,
      "Product fetched successfully.",
      product
    );
  } catch (error) {
    console.error(
      "Get Product By ID Error:",
      error
    );

    return errorResponse(
      res,
      500,
      error.message ||
        "Failed to fetch product."
    );
  }
};

// ======================================================
// UPDATE PRODUCT
// ======================================================

export const updateProduct = async (
  req,
  res
) => {
  const newUploadedImages = [];

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid product ID."
      );
    }

    const tenant = await resolveTenant(
      req,
      false
    );

    if (tenant.error) {
      return errorResponse(
        res,
        400,
        tenant.error
      );
    }

    const query = {
      _id: id,
    };

    if (tenant.tenantOwner) {
      query.tenantOwner =
        tenant.tenantOwner;
    }

    if (tenant.business) {
      query.business =
        tenant.business;
    }

    if (tenant.businessType) {
      query.businessType =
        tenant.businessType;
    }

    const product =
      await Product.findOne(query);

    if (!product) {
      return errorResponse(
        res,
        404,
        "Product not found."
      );
    }

    const businessId =
      product.business;

    const businessTypeId =
      product.businessType;

    const tenantOwner =
      product.tenantOwner;

    const {
      category,
      brand,
      model,
      name,
      barcode,
      barcodeType,
      shortDescription,
      description,
      productType,
      unit,
      hasVariants,
      trackSerial,
      isFeatured,
      isActive,
      removeImages,
    } = req.body;

    // ==================================================
    // VALIDATE BUSINESS
    // ==================================================

    const businessDoc =
      await validateBusiness(
        businessId
      );

    if (!businessDoc) {
      return errorResponse(
        res,
        400,
        "Product business is not found or inactive."
      );
    }

    // ==================================================
    // VALIDATE BUSINESS TYPE
    // ==================================================

    const businessTypeDoc =
      await validateBusinessType(
        businessTypeId,
        businessId
      );

    if (!businessTypeDoc) {
      return errorResponse(
        res,
        400,
        "Product business type is not found, inactive, or does not belong to this business."
      );
    }

    // ==================================================
    // CATEGORY
    // ==================================================

    if (category !== undefined) {
      const categoryDoc =
        await validateCategory(
          category,
          tenantOwner,
          businessId,
          businessTypeId
        );

      if (!categoryDoc) {
        return errorResponse(
          res,
          400,
          "Category does not belong to this tenant."
        );
      }

      product.category =
        categoryDoc._id;
    }

    // ==================================================
    // BRAND
    // ==================================================

    if (brand !== undefined) {
      const brandDoc =
        await validateBrand(
          brand,
          businessId,
          businessTypeId
        );

      if (!brandDoc) {
        return errorResponse(
          res,
          400,
          "Brand does not belong to the selected business type."
        );
      }

      product.brand =
        brandDoc._id;

      // Reset model if it no longer
      // belongs to the new brand.

      if (product.model) {
        const currentModel =
          await validateModel(
            product.model,
            businessId,
            businessTypeId,
            brandDoc._id
          );

        if (!currentModel) {
          product.model = null;
        }
      }
    }

    // ==================================================
    // MODEL
    // ==================================================

    if (model !== undefined) {
      if (
        model === null ||
        model === ""
      ) {
        product.model = null;
      } else {
        const modelDoc =
          await validateModel(
            model,
            businessId,
            businessTypeId,
            product.brand
          );

        if (!modelDoc) {
          return errorResponse(
            res,
            400,
            "Model does not belong to the selected brand and business type."
          );
        }

        product.model =
          modelDoc._id;
      }
    }

    // ==================================================
    // BARCODE
    // ==================================================

    if (barcode !== undefined) {
      const normalizedBarcode =
        normalizeBarcode(barcode);

      if (normalizedBarcode) {
        const exists =
          await Product.findOne({
            tenantOwner,
            barcode:
              normalizedBarcode,
            _id: {
              $ne: product._id,
            },
          }).select("_id");

        if (exists) {
          return errorResponse(
            res,
            409,
            "A product with this barcode already exists in this tenant."
          );
        }
      }

      product.barcode =
        normalizedBarcode;

      product.barcodeType =
        normalizedBarcode
          ? barcodeType ||
            product.barcodeType ||
            "CUSTOM"
          : "CUSTOM";
    } else if (
      barcodeType !== undefined
    ) {
      product.barcodeType =
        product.barcode
          ? barcodeType
          : "CUSTOM";
    }

    // ==================================================
    // PRODUCT TYPE / VARIANTS
    // ==================================================

    const nextType =
      productType !== undefined
        ? productType
        : product.productType;

    const nextVariants =
      hasVariants !== undefined
        ? parseBoolean(hasVariants)
        : productType !== undefined
        ? productType === "variable"
        : product.hasVariants;

    if (
      nextType === "simple" &&
      nextVariants
    ) {
      return errorResponse(
        res,
        400,
        "A simple product cannot have variants."
      );
    }

    if (
      nextType === "variable" &&
      !nextVariants
    ) {
      return errorResponse(
        res,
        400,
        "A variable product must have variants."
      );
    }

    product.productType =
      nextType;

    product.hasVariants =
      nextVariants;

    // ==================================================
    // TRACK SERIAL
    // ==================================================

    if (trackSerial !== undefined) {
      product.trackSerial =
        parseBoolean(trackSerial);
    }

    // ==================================================
    // NAME + AUTO SLUG
    // ==================================================

    if (name !== undefined) {
      const normalizedName =
        normalizeTitleCase(name);

      if (!normalizedName) {
        return errorResponse(
          res,
          400,
          "Product name cannot be empty."
        );
      }

      const nameChanged =
        normalizedName !==
        product.name;

      product.name =
        normalizedName;

      // Regenerate slug only when
      // product name changes.

      if (nameChanged) {
        product.slug =
          await generateUniqueSlug(
            normalizedName,
            tenantOwner,
            product._id
          );
      }
    }

    // ==================================================
    // DESCRIPTION
    // ==================================================

    if (
      shortDescription !== undefined
    ) {
      product.shortDescription =
        normalizeTitleCase(
          shortDescription
        );
    }

    if (
      description !== undefined
    ) {
      product.description =
        description.trim();
    }

    // ==================================================
    // UNIT
    // ==================================================

    if (unit !== undefined) {
      product.unit = unit;
    }

    // ==================================================
    // FEATURED / ACTIVE
    // ==================================================

    if (isFeatured !== undefined) {
      product.isFeatured =
        parseBoolean(isFeatured);
    }

    if (isActive !== undefined) {
      product.isActive =
        parseBoolean(isActive);
    }

    // ==================================================
    // SKU / SLUG
    // ==================================================
    //
    // SKU and slug are NOT accepted from frontend.
    //
    // They remain backend controlled.
    //
    // SKU changes are intentionally not allowed.
    // Slug changes automatically when name changes.
    // ==================================================

    // ==================================================
    // REMOVE IMAGES
    // ==================================================

    if (removeImages) {
      let images = removeImages;

      if (typeof images === "string") {
        try {
          images = JSON.parse(images);
        } catch {
          images = [images];
        }
      }

      if (Array.isArray(images)) {
        for (const publicId of images) {
          if (!publicId) {
            continue;
          }

          const exists =
            product.images.some(
              (img) =>
                img.publicId ===
                publicId
            );

          if (!exists) {
            continue;
          }

          await deleteFromCloudinary(
            publicId
          );

          product.images =
            product.images.filter(
              (img) =>
                img.publicId !==
                publicId
            );
        }
      }
    }

    // ==================================================
    // ADD NEW IMAGES
    // ==================================================

    if (req.files?.length) {
      for (const file of req.files) {
        const result =
          await uploadToCloudinary(
            file.buffer,
            "pos/products"
          );

        newUploadedImages.push(
          result.public_id
        );

        product.images.push({
          url: result.secure_url,
          publicId:
            result.public_id,
          assetId:
            result.asset_id || null,
        });
      }
    }

    // ==================================================
    // UPDATED BY
    // ==================================================

    product.updatedBy =
      req.user._id;

    // ==================================================
    // SAVE
    // ==================================================

    await product.save();

    // ==================================================
    // NO INVENTORY SYNC
    // ==================================================
    //
    // Financial fields are no longer in Product.
    //
    // ProductInventory is managed by its own controller.
    // ==================================================

    const updated =
      await populateProduct(
        Product.findById(product._id)
      );

    return successResponse(
      res,
      200,
      "Product updated successfully.",
      updated
    );
  } catch (error) {
    console.error(
      "Update Product Error:",
      error
    );

    // ==================================================
    // CLEANUP NEW IMAGES
    // ==================================================

    for (const publicId of newUploadedImages) {
      try {
        await deleteFromCloudinary(
          publicId
        );
      } catch {}
    }

    if (handleDuplicateError(error, res)) {
      return;
    }

    return errorResponse(
      res,
      500,
      error.message ||
        "Failed to update product."
    );
  }
};

// ======================================================
// DELETE PRODUCT — PERMANENT
// ======================================================

export const deleteProduct = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid product ID."
      );
    }

    const tenant = await resolveTenant(
      req,
      false
    );

    if (tenant.error) {
      return errorResponse(
        res,
        400,
        tenant.error
      );
    }

    const query = {
      _id: id,
    };

    if (tenant.tenantOwner) {
      query.tenantOwner =
        tenant.tenantOwner;
    }

    if (tenant.business) {
      query.business =
        tenant.business;
    }

    if (tenant.businessType) {
      query.businessType =
        tenant.businessType;
    }

    const product =
      await Product.findOne(query);

    if (!product) {
      return errorResponse(
        res,
        404,
        "Product not found."
      );
    }

    // ==================================================
    // DELETE CLOUDINARY IMAGES
    // ==================================================

    if (
      Array.isArray(product.images)
    ) {
      for (const image of product.images) {
        if (image?.publicId) {
          try {
            await deleteFromCloudinary(
              image.publicId
            );
          } catch (error) {
            console.error(
              "Cloudinary delete failed:",
              image.publicId,
              error?.message
            );
          }
        }
      }
    }

    // ==================================================
    // DELETE INVENTORY UNITS
    // ==================================================

    await InventoryUnit.deleteMany({
      tenantOwner:
        product.tenantOwner,
      product: product._id,
    });

    // ==================================================
    // DELETE PRODUCT INVENTORY
    // ==================================================

    await ProductInventory.deleteMany({
      tenantOwner:
        product.tenantOwner,
      product: product._id,
    });

    // ==================================================
    // DELETE PRODUCT
    // ==================================================

    await Product.deleteOne({
      _id: product._id,
    });

    return successResponse(
      res,
      200,
      "Product deleted permanently."
    );
  } catch (error) {
    console.error(
      "Delete Product Error:",
      error
    );

    return errorResponse(
      res,
      500,
      error.message ||
        "Failed to delete product."
    );
  }
};
