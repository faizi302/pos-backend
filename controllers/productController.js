import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import InventoryUnit from "../models/InventoryUnit.js";
import ProductSequence from "../models/ProductSequence.js";

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
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  return ["true", "1"].includes(String(value).toLowerCase());
};

const normalizeTitleCase = (value) => {
  if (value === undefined || value === null) return "";
  return String(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const normalizeBarcode = (value) => {
  if (value === undefined || value === null) return null;
  const barcode = String(value).trim();
  return barcode || null;
};

const makeSlug = (value = "") =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

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
// TENANT RESOLUTION
// ======================================================

const resolveTenant = async (req, requireOwner = true) => {
  const context = await getTenantContext(req);

  // Super Admin
  if (context.isSuperAdmin) {
    const requestedTenantOwner =
      req.body?.tenantOwner || req.query?.tenantOwner;

    if (requireOwner && !requestedTenantOwner) {
      return { error: "Tenant owner is required." };
    }

    if (requestedTenantOwner && !isValidObjectId(requestedTenantOwner)) {
      return { error: "Invalid tenant owner ID." };
    }

    if (!requestedTenantOwner) {
      return {
        context,
        tenantOwner: null,
        business: req.body?.business || req.query?.business || null,
        businessType: req.body?.businessType || req.query?.businessType || null,
      };
    }

    const admin = await User.findById(requestedTenantOwner)
      .select("_id role business businessType status")
      .populate("role", "slug");

    if (!admin) return { error: "Tenant owner not found." };

    const roleSlug = admin.role?.slug?.toLowerCase();
    if (roleSlug !== "admin") return { error: "Tenant owner must be an Admin." };
    if (admin.status !== "active") return { error: "Tenant owner account is not active." };
    if (!admin.business) return { error: "Tenant owner is not assigned to a business." };
    if (!admin.businessType) return { error: "Tenant owner is not assigned to a business type." };

    return {
      context,
      tenantOwner: admin._id,
      business: admin.business,
      businessType: admin.businessType,
    };
  }

  // Admin / Manager
  if (!context.tenantOwner) {
    return { error: "Your account is not associated with a tenant." };
  }

  if (!context.business || !context.businessType) {
    return {
      error: "Your account is not associated with a business and business type.",
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
// RELATION VALIDATORS (tenant-safe)
// ======================================================

const validateBusiness = (id) =>
  isValidObjectId(id)
    ? Business.findOne({ _id: id, isActive: true })
    : null;

const validateBusinessType = (id, businessId) =>
  isValidObjectId(id) && isValidObjectId(businessId)
    ? BusinessType.findOne({
        _id: id,
        business: businessId,
        isActive: true,
      })
    : null;

const validateCategory = (id, tenantOwner, businessId, businessTypeId) =>
  isValidObjectId(id) && tenantOwner && businessId && businessTypeId
    ? Category.findOne({
        _id: id,
        tenantOwner,
        business: businessId,
        isActive: true,
        $or: [{ businessType: businessTypeId }, { businessType: null }],
      })
    : null;

const validateBrand = (id, businessId, businessTypeId) =>
  isValidObjectId(id) && isValidObjectId(businessId) && isValidObjectId(businessTypeId)
    ? Brand.findOne({
        _id: id,
        business: businessId,
        businessType: businessTypeId,
        isActive: true,
      })
    : null;

const validateModel = async (id, businessId, businessTypeId, brandId) => {
  if (!id) return null;
  if (!isValidObjectId(id)) return false;
  if (!isValidObjectId(businessId) || !isValidObjectId(businessTypeId) || !isValidObjectId(brandId)) {
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
// SLUG GENERATION (tenant-scoped)
// ======================================================

const generateUniqueSlug = async (name, tenantOwner, excludeProductId = null) => {
  const baseSlug = makeSlug(name);
  if (!baseSlug) return null;

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query = { tenantOwner, slug };
    if (excludeProductId) query._id = { $ne: excludeProductId };

    const exists = await Product.exists(query);
    if (!exists) return slug;

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
};

// ======================================================
// SKU GENERATION (atomic, tenant-scoped, persistent)
// ======================================================

const generateSku = async (tenantOwner, business, businessType, brandName, modelName, productName) => {
  const brandPart = makeSlug(brandName || "PRODUCT")
    .replace(/-/g, "")
    .toUpperCase()
    .slice(0, 20) || "PRODUCT";

  const modelPart = makeSlug(modelName || productName || "ITEM")
    .replace(/-/g, "")
    .toUpperCase()
    .slice(0, 30) || "ITEM";

  const prefix = `${brandPart}-${modelPart}`;

  // Atomic increment – safe under concurrency
  const sequence = await ProductSequence.findOneAndUpdate(
    { tenantOwner, business, businessType },
    { $inc: { counter: 1 } },
    { upsert: true, new: true }
  );

  const number = String(sequence.counter).padStart(6, "0");
  return `${prefix}-${number}`;
};

// ======================================================
// DUPLICATE KEY HANDLER
// ======================================================

const handleDuplicateError = (error, res) => {
  if (error?.code !== 11000) return false;

  const keys = Object.keys(error.keyPattern || {});

  if (keys.includes("sku")) {
    return errorResponse(res, 409, "Generated SKU already exists. Please try again.");
  }
  if (keys.includes("slug")) {
    return errorResponse(res, 409, "Generated product slug already exists. Please try again.");
  }
  if (keys.includes("barcode")) {
    return errorResponse(res, 409, "A product with this barcode already exists in this tenant.");
  }

  return errorResponse(res, 409, "A product with the same unique value already exists.");
};

// ======================================================
// CREATE PRODUCT
// ======================================================

export const createProduct = async (req, res) => {
  const uploadedImages = [];

  try {
    const tenant = await resolveTenant(req, true);
    if (tenant.error) return errorResponse(res, 400, tenant.error);

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

    const { tenantOwner, business, businessType } = tenant;

    if (!category) return errorResponse(res, 400, "Category is required.");
    if (!brand) return errorResponse(res, 400, "Brand is required.");
    if (!name?.trim()) return errorResponse(res, 400, "Product name is required.");

    // Validate relations
    const businessDoc = await validateBusiness(business);
    if (!businessDoc) return errorResponse(res, 400, "Business not found or inactive.");

    const businessTypeDoc = await validateBusinessType(businessType, business);
    if (!businessTypeDoc) {
      return errorResponse(res, 400, "Business type not found or does not belong to this business.");
    }

    const categoryDoc = await validateCategory(category, tenantOwner, business, businessType);
    if (!categoryDoc) {
      return errorResponse(res, 400, "Category not found or does not belong to this tenant.");
    }

    const brandDoc = await validateBrand(brand, business, businessType);
    if (!brandDoc) {
      return errorResponse(res, 400, "Brand not found or does not belong to the selected business type.");
    }

    const modelDoc = await validateModel(model, business, businessType, brand);
    if (model && modelDoc === false) return errorResponse(res, 400, "Invalid model ID.");
    if (model && !modelDoc) {
      return errorResponse(res, 400, "Model not found or does not belong to the selected brand and business type.");
    }

    // Product type / variants consistency
    const parsedHasVariants = parseBoolean(hasVariants, productType === "variable");
    if (productType === "simple" && parsedHasVariants) {
      return errorResponse(res, 400, "A simple product cannot have variants.");
    }
    if (productType === "variable" && !parsedHasVariants) {
      return errorResponse(res, 400, "A variable product must have variants.");
    }

    // Serial tracking default for mobiles
    const isMobiles = businessTypeDoc.name?.toLowerCase().trim() === "mobiles";
    const parsedTrackSerial = parseBoolean(trackSerial, isMobiles);

    const productName = normalizeTitleCase(name);

    // Generate slug + SKU
    const productSlug = await generateUniqueSlug(productName, tenantOwner);
    const productSku = await generateSku(
      tenantOwner,
      business,
      businessType,
      brandDoc.name,
      modelDoc?.name,
      productName
    );

    // Barcode uniqueness
    const normalizedBarcode = normalizeBarcode(barcode);
    if (normalizedBarcode) {
      const existingBarcode = await Product.findOne({
        tenantOwner,
        barcode: normalizedBarcode,
      }).select("_id");

      if (existingBarcode) {
        return errorResponse(res, 409, "A product with this barcode already exists in this tenant.");
      }
    }

    // Images
    if (req.files?.length) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "pos/products");
        uploadedImages.push({
          url: result.secure_url,
          publicId: result.public_id,
          assetId: result.asset_id || null,
        });
      }
    }

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
      barcodeType: normalizedBarcode ? barcodeType || "CUSTOM" : "CUSTOM",
      shortDescription: shortDescription ? normalizeTitleCase(shortDescription) : "",
      description: description?.trim() || "",
      images: uploadedImages,
      productType,
      hasVariants: parsedHasVariants,
      trackSerial: parsedTrackSerial,
      unit,
      isFeatured: parseBoolean(isFeatured, false),
      isActive: parseBoolean(isActive, true),
      createdBy: req.user._id,
    });

    const populated = await populateProduct(Product.findById(product._id));

    return successResponse(res, 201, "Product created successfully.", populated);
  } catch (error) {
    console.error("Create Product Error:", error);

    // Cleanup uploaded images on failure
    for (const image of uploadedImages) {
      if (image?.publicId) {
        try {
          await deleteFromCloudinary(image.publicId);
        } catch {}
      }
    }

    if (handleDuplicateError(error, res)) return;

    return errorResponse(res, 500, error.message || "Failed to create product.");
  }
};

// ======================================================
// GET ALL PRODUCTS
// ======================================================

export const getAllProducts = async (req, res) => {
  try {
    const tenant = await resolveTenant(req, false);
    if (tenant.error) return errorResponse(res, 400, tenant.error);

    const { tenantOwner, business, businessType, context } = tenant;

    const {
      page = 1,
      limit = 20,
      search,
      category,
      brand,
      model,
      productType,
      isActive,
      isFeatured,
      hasVariants,
      trackSerial,
    } = req.query;

    const query = {};

    // Tenant isolation
    if (!context.isSuperAdmin) {
      query.tenantOwner = tenantOwner;
      query.business = business;
      query.businessType = businessType;
    } else if (tenantOwner) {
      query.tenantOwner = tenantOwner;
      if (business) query.business = business;
      if (businessType) query.businessType = businessType;
    }

    // Search
    if (search?.trim()) {
      const value = search.trim();
      query.$or = [
        { name: { $regex: value, $options: "i" } },
        { sku: { $regex: value, $options: "i" } },
        { slug: { $regex: value, $options: "i" } },
        { barcode: { $regex: value, $options: "i" } },
      ];
    }

    // Filters
    for (const [field, value] of [
      ["category", category],
      ["brand", brand],
      ["model", model],
    ]) {
      if (value) {
        if (!isValidObjectId(value)) {
          return errorResponse(res, 400, `Invalid ${field} ID.`);
        }
        query[field] = value;
      }
    }

    if (productType) query.productType = productType;
    if (isActive !== undefined) query.isActive = parseBoolean(isActive);
    if (isFeatured !== undefined) query.isFeatured = parseBoolean(isFeatured);
    if (hasVariants !== undefined) query.hasVariants = parseBoolean(hasVariants);
    if (trackSerial !== undefined) query.trackSerial = parseBoolean(trackSerial);

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const [products, total] = await Promise.all([
      populateProduct(
        Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNumber)
      ),
      Product.countDocuments(query),
    ]);

    return successResponse(res, 200, "Products fetched successfully.", {
      products,
      pagination: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    });
  } catch (error) {
    console.error("Get All Products Error:", error);
    return errorResponse(res, 500, error.message || "Failed to fetch products.");
  }
};

// ======================================================
// GET PRODUCT BY ID
// ======================================================

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return errorResponse(res, 400, "Invalid product ID.");

    const tenant = await resolveTenant(req, false);
    if (tenant.error) return errorResponse(res, 400, tenant.error);

    const query = { _id: id };
    if (tenant.tenantOwner) query.tenantOwner = tenant.tenantOwner;
    if (tenant.business) query.business = tenant.business;
    if (tenant.businessType) query.businessType = tenant.businessType;

    const product = await populateProduct(Product.findOne(query));
    if (!product) return errorResponse(res, 404, "Product not found.");

    return successResponse(res, 200, "Product fetched successfully.", product);
  } catch (error) {
    console.error("Get Product By ID Error:", error);
    return errorResponse(res, 500, error.message || "Failed to fetch product.");
  }
};

// ======================================================
// UPDATE PRODUCT
// ======================================================

export const updateProduct = async (req, res) => {
  const newUploadedImages = [];

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return errorResponse(res, 400, "Invalid product ID.");

    const tenant = await resolveTenant(req, false);
    if (tenant.error) return errorResponse(res, 400, tenant.error);

    const query = { _id: id };
    if (tenant.tenantOwner) query.tenantOwner = tenant.tenantOwner;
    if (tenant.business) query.business = tenant.business;
    if (tenant.businessType) query.businessType = tenant.businessType;

    const product = await Product.findOne(query);
    if (!product) return errorResponse(res, 404, "Product not found.");

    const businessId = product.business;
    const businessTypeId = product.businessType;
    const tenantOwner = product.tenantOwner;

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

    // Re-validate business / businessType (safety)
    const businessDoc = await validateBusiness(businessId);
    if (!businessDoc) {
      return errorResponse(res, 400, "Product business is not found or inactive.");
    }

    const businessTypeDoc = await validateBusinessType(businessTypeId, businessId);
    if (!businessTypeDoc) {
      return errorResponse(
        res,
        400,
        "Product business type is not found, inactive, or does not belong to this business."
      );
    }

    // Category
    if (category !== undefined) {
      const categoryDoc = await validateCategory(category, tenantOwner, businessId, businessTypeId);
      if (!categoryDoc) {
        return errorResponse(res, 400, "Category does not belong to this tenant.");
      }
      product.category = categoryDoc._id;
    }

    // Brand
    if (brand !== undefined) {
      const brandDoc = await validateBrand(brand, businessId, businessTypeId);
      if (!brandDoc) {
        return errorResponse(res, 400, "Brand does not belong to the selected business type.");
      }
      product.brand = brandDoc._id;

      // Reset model if it no longer belongs to the new brand
      if (product.model) {
        const currentModel = await validateModel(
          product.model,
          businessId,
          businessTypeId,
          brandDoc._id
        );
        if (!currentModel) product.model = null;
      }
    }

    // Model
    if (model !== undefined) {
      if (model === null || model === "") {
        product.model = null;
      } else {
        const modelDoc = await validateModel(model, businessId, businessTypeId, product.brand);
        if (!modelDoc) {
          return errorResponse(
            res,
            400,
            "Model does not belong to the selected brand and business type."
          );
        }
        product.model = modelDoc._id;
      }
    }

    // Barcode
    if (barcode !== undefined) {
      const normalizedBarcode = normalizeBarcode(barcode);
      if (normalizedBarcode) {
        const exists = await Product.findOne({
          tenantOwner,
          barcode: normalizedBarcode,
          _id: { $ne: product._id },
        }).select("_id");

        if (exists) {
          return errorResponse(
            res,
            409,
            "A product with this barcode already exists in this tenant."
          );
        }
      }
      product.barcode = normalizedBarcode;
      product.barcodeType = normalizedBarcode
        ? barcodeType || product.barcodeType || "CUSTOM"
        : "CUSTOM";
    } else if (barcodeType !== undefined) {
      product.barcodeType = product.barcode ? barcodeType : "CUSTOM";
    }

    // Product type / variants
    const nextType = productType !== undefined ? productType : product.productType;
    const nextVariants =
      hasVariants !== undefined
        ? parseBoolean(hasVariants)
        : productType !== undefined
        ? productType === "variable"
        : product.hasVariants;

    if (nextType === "simple" && nextVariants) {
      return errorResponse(res, 400, "A simple product cannot have variants.");
    }
    if (nextType === "variable" && !nextVariants) {
      return errorResponse(res, 400, "A variable product must have variants.");
    }

    product.productType = nextType;
    product.hasVariants = nextVariants;

    if (trackSerial !== undefined) {
      product.trackSerial = parseBoolean(trackSerial);
    }

    // Name + auto-regenerate slug
    if (name !== undefined) {
      const normalizedName = normalizeTitleCase(name);
      if (!normalizedName) {
        return errorResponse(res, 400, "Product name cannot be empty.");
      }

      const nameChanged = normalizedName !== product.name;
      product.name = normalizedName;

      if (nameChanged) {
        product.slug = await generateUniqueSlug(normalizedName, tenantOwner, product._id);
      }
    }

    if (shortDescription !== undefined) {
      product.shortDescription = normalizeTitleCase(shortDescription);
    }
    if (description !== undefined) {
      product.description = description.trim();
    }
    if (unit !== undefined) product.unit = unit;
    if (isFeatured !== undefined) product.isFeatured = parseBoolean(isFeatured);
    if (isActive !== undefined) product.isActive = parseBoolean(isActive);

    // Remove images
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
          if (!publicId) continue;
          const exists = product.images.some((img) => img.publicId === publicId);
          if (!exists) continue;

          await deleteFromCloudinary(publicId);
          product.images = product.images.filter((img) => img.publicId !== publicId);
        }
      }
    }

    // Add new images
    if (req.files?.length) {
      for (const file of req.files) {
        const result = await uploadToCloudinary(file.buffer, "pos/products");
        newUploadedImages.push(result.public_id);
        product.images.push({
          url: result.secure_url,
          publicId: result.public_id,
          assetId: result.asset_id || null,
        });
      }
    }

    product.updatedBy = req.user._id;
    await product.save();

    const updated = await populateProduct(Product.findById(product._id));
    return successResponse(res, 200, "Product updated successfully.", updated);
  } catch (error) {
    console.error("Update Product Error:", error);

    for (const publicId of newUploadedImages) {
      try {
        await deleteFromCloudinary(publicId);
      } catch {}
    }

    if (handleDuplicateError(error, res)) return;

    return errorResponse(res, 500, error.message || "Failed to update product.");
  }
};

// ======================================================
// DELETE PRODUCT — PERMANENT
// ======================================================

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return errorResponse(res, 400, "Invalid product ID.");

    const tenant = await resolveTenant(req, false);
    if (tenant.error) return errorResponse(res, 400, tenant.error);

    const query = { _id: id };
    if (tenant.tenantOwner) query.tenantOwner = tenant.tenantOwner;
    if (tenant.business) query.business = tenant.business;
    if (tenant.businessType) query.businessType = tenant.businessType;

    // Permanent delete with tenant isolation
    const product = await Product.findOneAndDelete(query);
    if (!product) return errorResponse(res, 404, "Product not found.");

    // Cloudinary cleanup
    if (Array.isArray(product.images)) {
      for (const image of product.images) {
        if (image?.publicId) {
          try {
            await deleteFromCloudinary(image.publicId);
          } catch (err) {
            console.error("Cloudinary delete failed:", image.publicId, err?.message);
          }
        }
      }
    }

    // Cascade: remove related inventory data (tenant-safe)
    await InventoryUnit.deleteMany({
      tenantOwner: product.tenantOwner,
      product: product._id,
    });

    await ProductInventory.deleteMany({
      tenantOwner: product.tenantOwner,
      product: product._id,
    });

    return successResponse(res, 200, "Product deleted successfully.");
  } catch (error) {
    console.error("Delete Product Error:", error);
    return errorResponse(res, 500, error.message || "Failed to delete product.");
  }
};