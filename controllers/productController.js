import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
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
  return String(value).toLowerCase() === "true";
};

const parseNumber = (value, defaultValue = 0) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
};

const normalizeBarcode = (value) => {
  if (value === undefined || value === null) return null;
  const barcode = String(value).trim();
  return barcode || null;
};

const normalizeSku = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim().toUpperCase();
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
// RESOLVE TENANT
// ======================================================

const resolveTenant = async (req, requireOwner = true) => {
  const context = await getTenantContext(req);

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
    return { error: "Your account is not associated with a business and business type." };
  }

  return {
    context,
    tenantOwner: context.tenantOwner,
    business: context.business,
    businessType: context.businessType,
  };
};

// ======================================================
// VALIDATORS
// ======================================================

const validateBusiness = (id) =>
  isValidObjectId(id) ? Business.findOne({ _id: id, isActive: true }) : null;

const validateBusinessType = (id, businessId) =>
  isValidObjectId(id) && isValidObjectId(businessId)
    ? BusinessType.findOne({ _id: id, business: businessId, isActive: true })
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
  if (!isValidObjectId(businessId) || !isValidObjectId(businessTypeId) || !isValidObjectId(brandId))
    return null;

  return Model.findOne({
    _id: id,
    business: businessId,
    businessType: businessTypeId,
    brand: brandId,
    isActive: true,
  });
};

const handleDuplicateError = (error, res) => {
  if (error?.code !== 11000) return false;

  const keys = Object.keys(error.keyPattern || {});
  if (keys.includes("sku")) {
    errorResponse(res, 409, "A product with this SKU already exists in this tenant.");
    return true;
  }
  if (keys.includes("barcode")) {
    errorResponse(res, 409, "A product with this barcode already exists in this tenant.");
    return true;
  }
  errorResponse(res, 409, "A product with the same unique value already exists.");
  return true;
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
      slug,
      sku,
      barcode,
      barcodeType,
      shortDescription,
      description,
      productType = "simple",
      unit = "piece",
      purchasePrice,
      salePrice,
      discount,
      tax,
      hasVariants,
      isFeatured,
      isActive,
      trackSerial,
    } = req.body;

    const { tenantOwner, business, businessType } = tenant;

    // Validate relations
    const businessDoc = await validateBusiness(business);
    if (!businessDoc) return errorResponse(res, 400, "Business not found or inactive.");

    const businessTypeDoc = await validateBusinessType(businessType, business);
    if (!businessTypeDoc)
      return errorResponse(res, 400, "Business type not found or does not belong to this business.");

    const categoryDoc = await validateCategory(category, tenantOwner, business, businessType);
    if (!categoryDoc)
      return errorResponse(res, 400, "Category not found or does not belong to this tenant.");

    const brandDoc = await validateBrand(brand, business, businessType);
    if (!brandDoc)
      return errorResponse(res, 400, "Brand not found or does not belong to the selected business type.");

    const modelDoc = await validateModel(model, business, businessType, brand);
    if (model && modelDoc === false) return errorResponse(res, 400, "Invalid model ID.");
    if (model && !modelDoc)
      return errorResponse(res, 400, "Model not found or does not belong to the selected brand and business type.");

    // SKU & Barcode uniqueness
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) return errorResponse(res, 400, "SKU is required.");

    const existingSku = await Product.findOne({ tenantOwner, sku: normalizedSku }).select("_id");
    if (existingSku)
      return errorResponse(res, 409, "A product with this SKU already exists in this tenant.");

    const normalizedBarcode = normalizeBarcode(barcode);
    if (normalizedBarcode) {
      const existingBarcode = await Product.findOne({
        tenantOwner,
        barcode: normalizedBarcode,
      }).select("_id");
      if (existingBarcode)
        return errorResponse(res, 409, "A product with this barcode already exists in this tenant.");
    }

    // Variants & Track Serial
    const parsedHasVariants = parseBoolean(hasVariants, productType === "variable");
    if (productType === "simple" && parsedHasVariants)
      return errorResponse(res, 400, "A simple product cannot have variants.");
    if (productType === "variable" && !parsedHasVariants)
      return errorResponse(res, 400, "A variable product must have variants.");

    const isMobiles = businessTypeDoc.name?.toLowerCase().trim() === "mobiles";
    const parsedTrackSerial = parseBoolean(trackSerial, isMobiles);

    // Prices
    const parsedPurchasePrice = parseNumber(purchasePrice, 0);
    const parsedSalePrice = parseNumber(salePrice, 0);
    const parsedDiscount = parseNumber(discount, 0);
    const parsedTax = parseNumber(tax, 0);

    if (parsedPurchasePrice < 0 || parsedSalePrice < 0)
      return errorResponse(res, 400, "Prices cannot be negative.");
    if (parsedDiscount < 0 || parsedDiscount > 100)
      return errorResponse(res, 400, "Discount must be between 0 and 100.");
    if (parsedTax < 0) return errorResponse(res, 400, "Tax cannot be negative.");

    // Name & Slug
    const productName =
      name?.trim() || `${brandDoc.name}${modelDoc ? ` ${modelDoc.name}` : ""}`;
    const productSlug = slug?.trim()
      ? slug.trim().toLowerCase()
      : makeSlug(productName);

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

    // Create Product
    const product = await Product.create({
      tenantOwner,
      business,
      businessType,
      category: categoryDoc._id,
      brand: brandDoc._id,
      model: modelDoc?._id || null,
      name: productName,
      slug: productSlug,
      sku: normalizedSku,
      barcode: normalizedBarcode,
      barcodeType: normalizedBarcode ? barcodeType || "CUSTOM" : "CUSTOM",
      shortDescription: shortDescription?.trim() || "",
      description: description?.trim() || "",
      images: uploadedImages,
      productType,
      hasVariants: parsedHasVariants,
      trackSerial: parsedTrackSerial,
      unit,
      purchasePrice: parsedPurchasePrice,
      salePrice: parsedSalePrice,
      discount: parsedDiscount,
      tax: parsedTax,
      isFeatured: parseBoolean(isFeatured, false),
      isActive: parseBoolean(isActive, true),
      createdBy: req.user._id,
    });

    // Default inventory (only for non-serial, non-variant products)
    if (!parsedHasVariants && !parsedTrackSerial) {
      await ProductInventory.create({
        tenantOwner,
        business,
        businessType,
        product: product._id,
        color: null,
        size: null,
        imei: null,
        unitBarcode: null,
        quantity: 0,
        minStock: 0,
        maxStock: null,
        purchasePrice: parsedPurchasePrice,
        salePrice: parsedSalePrice,
        discount: parsedDiscount,
        tax: parsedTax,
        isActive: true,
        createdBy: req.user._id,
      });
    }

    const populated = await populateProduct(Product.findById(product._id));
    return successResponse(res, 201, "Product created successfully.", populated);
  } catch (error) {
    console.error("Create Product Error:", error);

    // Cleanup uploaded images
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
      stockStatus,
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
        if (!isValidObjectId(value))
          return errorResponse(res, 400, `Invalid ${field} ID.`);
        query[field] = value;
      }
    }

    if (productType) query.productType = productType;
    if (isActive !== undefined) query.isActive = parseBoolean(isActive);
    if (trackSerial !== undefined) query.trackSerial = parseBoolean(trackSerial);

    // Pagination
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;

    const [products, total] = await Promise.all([
      populateProduct(
        Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNumber)
      ),
      Product.countDocuments(query),
    ]);

    // Optional stock status filter (simple version)
    let result = products;
    if (stockStatus) {
      if (!["out-of-stock", "low-stock", "in-stock"].includes(stockStatus)) {
        return errorResponse(res, 400, "Invalid stock status.");
      }
      // You can enhance this later with aggregation if needed
    }

    return successResponse(res, 200, "Products fetched successfully.", {
      products: result,
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
      slug,
      sku,
      barcode,
      barcodeType,
      shortDescription,
      description,
      productType,
      unit,
      purchasePrice,
      salePrice,
      discount,
      tax,
      hasVariants,
      trackSerial,
      isFeatured,
      isActive,
      removeImages,
    } = req.body;

    // Validate business still exists
    const businessDoc = await validateBusiness(businessId);
    if (!businessDoc)
      return errorResponse(res, 400, "Product business is not found or inactive.");

    const businessTypeDoc = await validateBusinessType(businessTypeId, businessId);
    if (!businessTypeDoc)
      return errorResponse(
        res,
        400,
        "Product business type is not found, inactive, or does not belong to this business."
      );

    // Category
    if (category !== undefined) {
      const categoryDoc = await validateCategory(
        category,
        tenantOwner,
        businessId,
        businessTypeId
      );
      if (!categoryDoc)
        return errorResponse(res, 400, "Category does not belong to this tenant.");
      product.category = categoryDoc._id;
    }

    // Brand
    if (brand !== undefined) {
      const brandDoc = await validateBrand(brand, businessId, businessTypeId);
      if (!brandDoc)
        return errorResponse(res, 400, "Brand does not belong to the selected business type.");
      product.brand = brandDoc._id;

      // Reset model if it no longer belongs to new brand
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
        const modelDoc = await validateModel(
          model,
          businessId,
          businessTypeId,
          product.brand
        );
        if (!modelDoc)
          return errorResponse(
            res,
            400,
            "Model does not belong to the selected brand and business type."
          );
        product.model = modelDoc._id;
      }
    }

    // SKU
    if (sku !== undefined) {
      const normalizedSku = normalizeSku(sku);
      if (!normalizedSku) return errorResponse(res, 400, "SKU cannot be empty.");

      if (normalizedSku !== product.sku) {
        const exists = await Product.findOne({
          tenantOwner,
          sku: normalizedSku,
          _id: { $ne: product._id },
        }).select("_id");
        if (exists)
          return errorResponse(res, 409, "A product with this SKU already exists in this tenant.");
      }
      product.sku = normalizedSku;
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
        if (exists)
          return errorResponse(
            res,
            409,
            "A product with this barcode already exists in this tenant."
          );
      }
      product.barcode = normalizedBarcode;
      product.barcodeType = normalizedBarcode
        ? barcodeType || product.barcodeType || "CUSTOM"
        : "CUSTOM";
    } else if (barcodeType !== undefined) {
      product.barcodeType = product.barcode ? barcodeType : "CUSTOM";
    }

    // Product type & variants
    const nextType = productType !== undefined ? productType : product.productType;
    const nextVariants =
      hasVariants !== undefined
        ? parseBoolean(hasVariants)
        : productType !== undefined
        ? productType === "variable"
        : product.hasVariants;

    if (nextType === "simple" && nextVariants)
      return errorResponse(res, 400, "A simple product cannot have variants.");
    if (nextType === "variable" && !nextVariants)
      return errorResponse(res, 400, "A variable product must have variants.");

    product.productType = nextType;
    product.hasVariants = nextVariants;

    // Track Serial
    if (trackSerial !== undefined) {
      product.trackSerial = parseBoolean(trackSerial);
    }

    // Name, slug, descriptions
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) return errorResponse(res, 400, "Product name cannot be empty.");
      product.name = trimmed;
    }
    if (slug !== undefined) {
      product.slug = slug.trim() ? slug.trim().toLowerCase() : makeSlug(product.name);
    }
    if (shortDescription !== undefined) product.shortDescription = shortDescription.trim();
    if (description !== undefined) product.description = description.trim();
    if (unit !== undefined) product.unit = unit;

    // Prices
    if (purchasePrice !== undefined) {
      const value = parseNumber(purchasePrice);
      if (value < 0) return errorResponse(res, 400, "Purchase price cannot be negative.");
      product.purchasePrice = value;
    }
    if (salePrice !== undefined) {
      const value = parseNumber(salePrice);
      if (value < 0) return errorResponse(res, 400, "Sale price cannot be negative.");
      product.salePrice = value;
    }
    if (discount !== undefined) {
      const value = parseNumber(discount);
      if (value < 0 || value > 100)
        return errorResponse(res, 400, "Discount must be between 0 and 100.");
      product.discount = value;
    }
    if (tax !== undefined) {
      const value = parseNumber(tax);
      if (value < 0) return errorResponse(res, 400, "Tax cannot be negative.");
      product.tax = value;
    }

    // Booleans
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

    // Sync default inventory only for non-serial products
    if (!product.hasVariants && !product.trackSerial) {
      let inventory = await ProductInventory.findOne({
        product: product._id,
        business: businessId,
        color: null,
        size: null,
        imei: null,
      });

      if (!inventory) {
        await ProductInventory.create({
          tenantOwner,
          business: businessId,
          businessType: businessTypeId,
          product: product._id,
          color: null,
          size: null,
          imei: null,
          unitBarcode: null,
          quantity: 0,
          minStock: 0,
          maxStock: null,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          discount: product.discount,
          tax: product.tax,
          isActive: true,
          createdBy: req.user._id,
        });
      } else {
        inventory.purchasePrice = product.purchasePrice;
        inventory.salePrice = product.salePrice;
        inventory.discount = product.discount;
        inventory.tax = product.tax;
        inventory.updatedBy = req.user._id;
        await inventory.save();
      }
    }

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
// DELETE PRODUCT (soft)
// ======================================================

// ======================================================
// DELETE PRODUCT (hard — permanent)
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

    const product = await Product.findOne(query);
    if (!product) return errorResponse(res, 404, "Product not found.");

    // Delete Cloudinary images
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        if (img?.publicId) {
          try {
            await deleteFromCloudinary(img.publicId);
          } catch (err) {
            console.error("Cloudinary delete failed:", img.publicId, err?.message);
          }
        }
      }
    }

    // Delete related inventory rows
    await ProductInventory.deleteMany({
      product: product._id,
      ...(tenant.business ? { business: product.business } : {}),
    });

    // Permanent remove
    await Product.deleteOne({ _id: product._id });

    return successResponse(res, 200, "Product deleted permanently.");
  } catch (error) {
    console.error("Delete Product Error:", error);
    return errorResponse(res, 500, error.message || "Failed to delete product.");
  }
};