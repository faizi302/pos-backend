import mongoose from "mongoose";

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

// ======================================================
// HELPER FUNCTIONS
// ======================================================

const getUserRole = (user) => {
  return (
    user?.role?.slug ||
    user?.role?.name?.toLowerCase()
  );
};

const isSuperAdmin = (user) => {
  return getUserRole(user) === "super-admin";
};

// ======================================================
// OBJECT ID VALIDATION
// ======================================================

const isValidObjectId = (value) => {
  return (
    value &&
    mongoose.Types.ObjectId.isValid(value)
  );
};

// ======================================================
// PARSE BOOLEAN
// ======================================================
//
// Correctly handles multipart/form-data:
//
// "true"  -> true
// "false" -> false
// true    -> true
// false   -> false
//
// ======================================================

const parseBoolean = (
  value,
  defaultValue = false
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return (
    String(value).toLowerCase() === "true"
  );
};

// ======================================================
// PARSE NUMBER
// ======================================================

const parseNumber = (
  value,
  defaultValue = 0
) => {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return defaultValue;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : defaultValue;
};

// ======================================================
// GET EFFECTIVE BUSINESS CONTEXT
// ======================================================
//
// Super Admin:
//   No fixed business.
//
// Admin:
//   business + businessType directly from User.
//
// Manager:
//   business/businessType inherited from Admin
//   through createdBy.
//
// ======================================================

const getEffectiveBusinessContext = async (
  user
) => {
  if (!user) {
    return null;
  }

  // --------------------------------------------------
  // ADMIN WITH DIRECT BUSINESS
  // --------------------------------------------------

  if (user.business) {
    return {
      business:
        user.business?._id ||
        user.business,

      businessType:
        user.businessType?._id ||
        user.businessType ||
        null,
    };
  }

  // --------------------------------------------------
  // MANAGER
  // --------------------------------------------------

  if (user.createdBy) {
    const creator =
      await User.findById(
        user.createdBy
      ).select(
        "business businessType"
      );

    if (!creator) {
      return null;
    }

    return {
      business:
        creator.business?._id ||
        creator.business ||
        null,

      businessType:
        creator.businessType?._id ||
        creator.businessType ||
        null,
    };
  }

  return null;
};

// ======================================================
// VALIDATE BUSINESS
// ======================================================

const validateBusiness = async (
  businessId
) => {
  if (!businessId) {
    return {
      valid: false,
      message: "Business is required.",
    };
  }

  if (!isValidObjectId(businessId)) {
    return {
      valid: false,
      message: "Invalid business ID.",
    };
  }

  const business =
    await Business.findOne({
      _id: businessId,
      isActive: true,
    });

  if (!business) {
    return {
      valid: false,
      message:
        "Business not found or inactive.",
    };
  }

  return {
    valid: true,
    business,
  };
};

// ======================================================
// VALIDATE BUSINESS TYPE
// ======================================================

const validateBusinessType = async (
  businessTypeId,
  businessId
) => {
  if (!businessTypeId) {
    return {
      valid: false,
      message:
        "Business type is required.",
    };
  }

  if (
    !isValidObjectId(
      businessTypeId
    )
  ) {
    return {
      valid: false,
      message:
        "Invalid business type ID.",
    };
  }

  const businessType =
    await BusinessType.findOne({
      _id: businessTypeId,
      business: businessId,
      isActive: true,
    });

  if (!businessType) {
    return {
      valid: false,
      message:
        "Business type not found or does not belong to this business.",
    };
  }

  return {
    valid: true,
    businessType,
  };
};

// ======================================================
// VALIDATE CATEGORY
// ======================================================
//
// Category belongs to Business.
//
// If category.businessType exists,
// it must match selected BusinessType.
//
// If category.businessType is null,
// it is treated as shared inside that Business.
//
// ======================================================

const validateCategory = async (
  categoryId,
  businessId,
  businessTypeId = null
) => {
  if (!categoryId) {
    return {
      valid: false,
      message: "Category is required.",
    };
  }

  if (!isValidObjectId(categoryId)) {
    return {
      valid: false,
      message: "Invalid category ID.",
    };
  }

  const category =
    await Category.findOne({
      _id: categoryId,
      business: businessId,
      isActive: true,
    });

  if (!category) {
    return {
      valid: false,
      message:
        "Category not found or does not belong to this business.",
    };
  }

  // --------------------------------------------------
  // TYPE-SPECIFIC CATEGORY
  // --------------------------------------------------

  if (
    category.businessType &&
    businessTypeId &&
    category.businessType.toString() !==
      businessTypeId.toString()
  ) {
    return {
      valid: false,
      message:
        "Category does not belong to the selected business type.",
    };
  }

  return {
    valid: true,
    category,
  };
};

// ======================================================
// VALIDATE BRAND
// ======================================================
//
// Brand must belong to:
//
// Business
// +
// BusinessType
//
// ======================================================

const validateBrand = async (
  brandId,
  businessId,
  businessTypeId
) => {
  if (!brandId) {
    return {
      valid: false,
      message: "Brand is required.",
    };
  }

  if (!isValidObjectId(brandId)) {
    return {
      valid: false,
      message: "Invalid brand ID.",
    };
  }

  const brand =
    await Brand.findOne({
      _id: brandId,
      business: businessId,
      businessType: businessTypeId,
      isActive: true,
    });

  if (!brand) {
    return {
      valid: false,
      message:
        "Brand not found or does not belong to the selected business/business type.",
    };
  }

  return {
    valid: true,
    brand,
  };
};

// ======================================================
// VALIDATE MODEL
// ======================================================
//
// Model must belong to:
//
// Business
// +
// BusinessType
// +
// Brand
//
// ======================================================

const validateModel = async (
  modelId,
  brandId,
  businessId,
  businessTypeId
) => {
  if (
    modelId === undefined ||
    modelId === null ||
    modelId === ""
  ) {
    return {
      valid: true,
      model: null,
    };
  }

  if (!isValidObjectId(modelId)) {
    return {
      valid: false,
      message: "Invalid model ID.",
    };
  }

  const model =
    await Model.findOne({
      _id: modelId,
      brand: brandId,
      business: businessId,
      businessType: businessTypeId,
      isActive: true,
    });

  if (!model) {
    return {
      valid: false,
      message:
        "Model not found, inactive, or does not belong to the selected business, business type, and brand.",
    };
  }

  return {
    valid: true,
    model,
  };
};

// ======================================================
// NORMALIZE BARCODE
// ======================================================

const normalizeBarcode = (
  barcode
) => {
  if (
    barcode === undefined ||
    barcode === null
  ) {
    return null;
  }

  const value =
    String(barcode).trim();

  return value || null;
};

// ======================================================
// NORMALIZE BARCODE TYPE
// ======================================================
//
// No barcode = CUSTOM
//
// ======================================================

const normalizeBarcodeType = (
  barcode,
  barcodeType
) => {
  const normalizedBarcode =
    normalizeBarcode(barcode);

  if (!normalizedBarcode) {
    return "CUSTOM";
  }

  return barcodeType || "CUSTOM";
};

// ======================================================
// VALIDATE PRODUCT TYPE / VARIANTS
// ======================================================
//
// simple   -> hasVariants false
// variable -> hasVariants true
//
// service/digital/bundle are allowed,
// but variant handling follows hasVariants.
//
// ======================================================

const validateProductTypeAndVariants = (
  productType,
  hasVariants
) => {
  if (
    productType === "simple" &&
    hasVariants === true
  ) {
    return {
      valid: false,
      message:
        "A simple product cannot have variants. Use product type 'variable'.",
    };
  }

  if (
    productType === "variable" &&
    hasVariants === false
  ) {
    return {
      valid: false,
      message:
        "A variable product must have variants.",
    };
  }

  return {
    valid: true,
  };
};

// ======================================================
// DUPLICATE KEY ERROR
// ======================================================

const handleDuplicateKeyError = (
  error,
  res
) => {
  if (error?.code !== 11000) {
    return false;
  }

  const keyPattern =
    error.keyPattern || {};

  if (
    keyPattern.business &&
    keyPattern.sku
  ) {
    res.status(409).json({
      success: false,
      message:
        "A product with this SKU already exists in this business.",
    });

    return true;
  }

  if (
    keyPattern.business &&
    keyPattern.barcode
  ) {
    res.status(409).json({
      success: false,
      message:
        "A product with this barcode already exists in this business.",
    });

    return true;
  }

  res.status(409).json({
    success: false,
    message:
      "A product with the same unique value already exists in this business.",
  });

  return true;
};

// ======================================================
// POPULATE PRODUCT
// ======================================================

const populateProduct = (
  query
) => {
  return query
    .populate(
      "business",
      "name"
    )
    .populate(
      "businessType",
      "name"
    )
    .populate(
      "category",
      "name slug"
    )
    .populate(
      "brand",
      "name"
    )
    .populate(
      "model",
      "name"
    )
    .populate(
      "createdBy",
      "name email"
    )
    .populate(
      "updatedBy",
      "name email"
    );
};

// ======================================================
// CREATE PRODUCT
// ======================================================

export const createProduct = async (
  req,
  res
) => {
  const uploadedCloudinaryImages = [];

  try {
    const {
      businessType,
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
    } = req.body;

    // ==================================================
    // BUSINESS CONTEXT
    // ==================================================

    let businessId;
    let effectiveBusinessType;

    if (isSuperAdmin(req.user)) {
      // ------------------------------------------------
      // SUPER ADMIN
      // ------------------------------------------------

      businessId =
        req.body.business ||
        req.query.business ||
        null;

      effectiveBusinessType =
        businessType || null;
    } else {
      // ------------------------------------------------
      // ADMIN / MANAGER
      // ------------------------------------------------
      //
      // NEVER trust business/businessType
      // from frontend.
      //
      // Resolve from authenticated user.
      //

      const context =
        await getEffectiveBusinessContext(
          req.user
        );

      if (!context?.business) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business.",
        });
      }

      if (!context?.businessType) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business type.",
        });
      }

      businessId =
        context.business;

      effectiveBusinessType =
        context.businessType;
    }

    // ==================================================
    // BUSINESS
    // ==================================================

    const businessResult =
      await validateBusiness(
        businessId
      );

    if (!businessResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          businessResult.message,
      });
    }

    // ==================================================
    // BUSINESS TYPE
    // ==================================================

    const businessTypeResult =
      await validateBusinessType(
        effectiveBusinessType,
        businessId
      );

    if (!businessTypeResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          businessTypeResult.message,
      });
    }

    const validatedBusinessType =
      businessTypeResult.businessType;

    // ==================================================
    // CATEGORY
    // ==================================================

    const categoryResult =
      await validateCategory(
        category,
        businessId,
        validatedBusinessType._id
      );

    if (!categoryResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          categoryResult.message,
      });
    }

    // ==================================================
    // BRAND
    // ==================================================

    const brandResult =
      await validateBrand(
        brand,
        businessId,
        validatedBusinessType._id
      );

    if (!brandResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          brandResult.message,
      });
    }

    // ==================================================
    // MODEL
    // ==================================================

    const modelResult =
      await validateModel(
        model,
        brand,
        businessId,
        validatedBusinessType._id
      );

    if (!modelResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          modelResult.message,
      });
    }

    // ==================================================
    // PRODUCT TYPE
    // ==================================================

    const parsedHasVariants =
      parseBoolean(
        hasVariants,
        productType === "variable"
      );

    const productTypeResult =
      validateProductTypeAndVariants(
        productType,
        parsedHasVariants
      );

    if (!productTypeResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          productTypeResult.message,
      });
    }

    // ==================================================
    // PRODUCT NAME
    // ==================================================

    const productName =
      name?.trim() ||
      `${brandResult.brand.name}${
        modelResult.model
          ? ` ${modelResult.model.name}`
          : ""
      }`;

    // ==================================================
    // SKU
    // ==================================================

    const normalizedSku =
      sku?.trim().toUpperCase();

    if (!normalizedSku) {
      return res.status(400).json({
        success: false,
        message:
          "SKU is required.",
      });
    }

    const existingSku =
      await Product.findOne({
        business: businessId,
        sku: normalizedSku,
      }).select("_id");

    if (existingSku) {
      return res.status(409).json({
        success: false,
        message:
          "A product with this SKU already exists in this business.",
      });
    }

    // ==================================================
    // BARCODE
    // ==================================================

    const normalizedBarcode =
      normalizeBarcode(
        barcode
      );

    const normalizedBarcodeType =
      normalizeBarcodeType(
        normalizedBarcode,
        barcodeType
      );

    // --------------------------------------------------
    // OPTIONAL EARLY BARCODE CHECK
    // --------------------------------------------------

    if (normalizedBarcode) {
      const existingBarcode =
        await Product.findOne({
          business: businessId,
          barcode:
            normalizedBarcode,
        }).select("_id");

      if (existingBarcode) {
        return res.status(409).json({
          success: false,
          message:
            "A product with this barcode already exists in this business.",
        });
      }
    }

    // ==================================================
    // BOOLEAN VALUES
    // ==================================================

    const parsedIsFeatured =
      parseBoolean(
        isFeatured,
        false
      );

    const parsedIsActive =
      parseBoolean(
        isActive,
        true
      );

    // ==================================================
    // PRICE VALUES
    // ==================================================

    const parsedPurchasePrice =
      parseNumber(
        purchasePrice,
        0
      );

    const parsedSalePrice =
      parseNumber(
        salePrice,
        0
      );

    const parsedDiscount =
      parseNumber(
        discount,
        0
      );

    const parsedTax =
      parseNumber(
        tax,
        0
      );

    // ==================================================
    // PRICE VALIDATION
    // ==================================================

    if (
      parsedPurchasePrice < 0 ||
      parsedSalePrice < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Prices cannot be negative.",
      });
    }

    if (
      parsedDiscount < 0 ||
      parsedDiscount > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Discount must be between 0 and 100.",
      });
    }

    if (parsedTax < 0) {
      return res.status(400).json({
        success: false,
        message:
          "Tax cannot be negative.",
      });
    }

    // ==================================================
    // UPLOAD IMAGES
    // ==================================================

    const uploadedImages = [];

    if (
      req.files &&
      req.files.length > 0
    ) {
      for (const file of req.files) {
        const result =
          await uploadToCloudinary(
            file.buffer,
            "pos/products"
          );

        uploadedCloudinaryImages.push(
          result.public_id
        );

        uploadedImages.push({
          url: result.secure_url,
          publicId:
            result.public_id,
          assetId:
            result.asset_id || null,
        });
      }
    }

    // ==================================================
    // CREATE PRODUCT
    // ==================================================

    const product =
      await Product.create({
        business:
          businessId,

        businessType:
          validatedBusinessType._id,

        category:
          categoryResult.category._id,

        brand:
          brandResult.brand._id,

        model:
          modelResult.model?._id ||
          null,

        name:
          productName,

        slug:
          slug?.trim()
            ? slug
                .trim()
                .toLowerCase()
            : productName
                .trim()
                .toLowerCase()
                .replace(
                  /[^a-z0-9]+/g,
                  "-"
                )
                .replace(
                  /^-+|-+$/g,
                  ""
                ),

        sku:
          normalizedSku,

        barcode:
          normalizedBarcode,

        barcodeType:
          normalizedBarcodeType,

        shortDescription:
          shortDescription?.trim() ||
          "",

        description:
          description?.trim() ||
          "",

        images:
          uploadedImages,

        productType:
          productType,

        unit:
          unit || "piece",

        purchasePrice:
          parsedPurchasePrice,

        salePrice:
          parsedSalePrice,

        discount:
          parsedDiscount,

        tax:
          parsedTax,

        hasVariants:
          parsedHasVariants,

        isFeatured:
          parsedIsFeatured,

        isActive:
          parsedIsActive,

        createdBy:
          req.user._id,
      });

    // ==================================================
    // CREATE DEFAULT INVENTORY
    // ==================================================
    //
    // Only non-variant products get the default
    // inventory record.
    //
    // ==================================================

    if (!parsedHasVariants) {
      await ProductInventory.create({
        business:
          businessId,

        product:
          product._id,

        color: null,
        size: null,

        quantity: 0,
        minStock: 0,
        maxStock: null,

        purchasePrice:
          parsedPurchasePrice,

        salePrice:
          parsedSalePrice,

        discount:
          parsedDiscount,

        tax:
          parsedTax,

        isActive: true,

        createdBy:
          req.user._id,
      });
    }

    // ==================================================
    // POPULATE PRODUCT
    // ==================================================

    const populatedProduct =
      await populateProduct(
        Product.findById(
          product._id
        )
      );

    return res.status(201).json({
      success: true,
      message:
        "Product created successfully.",
      data:
        populatedProduct,
    });
  } catch (error) {
    console.error(
      "Create Product Error:",
      error
    );

    // --------------------------------------------------
    // CLEAN UP CLOUDINARY IMAGES IF DB CREATE FAILED
    // --------------------------------------------------

    if (
      uploadedCloudinaryImages.length
    ) {
      for (const publicId of uploadedCloudinaryImages) {
        try {
          await deleteFromCloudinary(
            publicId
          );
        } catch (cloudinaryError) {
          console.error(
            "Cloudinary cleanup error:",
            cloudinaryError
          );
        }
      }
    }

    // --------------------------------------------------
    // DUPLICATE KEY
    // --------------------------------------------------

    if (
      handleDuplicateKeyError(
        error,
        res
      )
    ) {
      return;
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to create product.",
    });
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
      business,
      businessType,
    } = req.query;

    const query = {};

    // ==================================================
    // TENANT SECURITY
    // ==================================================

    if (isSuperAdmin(req.user)) {
      // ------------------------------------------------
      // SUPER ADMIN
      // ------------------------------------------------

      if (business) {
        if (
          !isValidObjectId(
            business
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business ID.",
          });
        }

        query.business =
          business;
      }

      if (businessType) {
        if (
          !isValidObjectId(
            businessType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business type ID.",
          });
        }

        query.businessType =
          businessType;
      }
    } else {
      // ------------------------------------------------
      // ADMIN / MANAGER
      // ------------------------------------------------

      const context =
        await getEffectiveBusinessContext(
          req.user
        );

      if (!context?.business) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business.",
        });
      }

      if (!context?.businessType) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business type.",
        });
      }

      // IMPORTANT:
      // Never allow frontend to override these.

      query.business =
        context.business;

      query.businessType =
        context.businessType;
    }

    // ==================================================
    // SEARCH
    // ==================================================

    if (search?.trim()) {
      const searchValue =
        search.trim();

      query.$or = [
        {
          name: {
            $regex:
              searchValue,
            $options: "i",
          },
        },
        {
          sku: {
            $regex:
              searchValue,
            $options: "i",
          },
        },
        {
          barcode: {
            $regex:
              searchValue,
            $options: "i",
          },
        },
      ];
    }

    // ==================================================
    // FILTERS
    // ==================================================

    if (category) {
      if (
        !isValidObjectId(
          category
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid category ID.",
        });
      }

      query.category =
        category;
    }

    if (brand) {
      if (
        !isValidObjectId(
          brand
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid brand ID.",
        });
      }

      query.brand =
        brand;
    }

    if (model) {
      if (
        !isValidObjectId(
          model
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid model ID.",
        });
      }

      query.model =
        model;
    }

    if (productType) {
      query.productType =
        productType;
    }

    if (isActive !== undefined) {
      query.isActive =
        parseBoolean(
          isActive
        );
    }

    // ==================================================
    // PAGINATION
    // ==================================================

    const pageNumber =
      Math.max(
        Number(page) || 1,
        1
      );

    const limitNumber =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

    const skip =
      (pageNumber - 1) *
      limitNumber;

    // ==================================================
    // PRODUCTS
    // ==================================================

    const [products, total] =
      await Promise.all([
        populateProduct(
          Product.find(query)
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(
              limitNumber
            )
        ),

        Product.countDocuments(
          query
        ),
      ]);

    // ==================================================
    // STOCK STATUS
    // ==================================================
    //
    // This preserves your existing stock filtering
    // functionality.
    //
    // ==================================================

    let filteredProducts =
      products;

    if (stockStatus) {
      const validStockStatuses = [
        "out-of-stock",
        "low-stock",
        "in-stock",
      ];

      if (
        !validStockStatuses.includes(
          stockStatus
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid stock status.",
        });
      }

      const productIds =
        products.map(
          (product) =>
            product._id
        );

      const inventoryQuery = {
        product: {
          $in: productIds,
        },

        isActive: true,
      };

      // ------------------------------------------------
      // INVENTORY TENANT SECURITY
      // ------------------------------------------------

      if (isSuperAdmin(req.user)) {
        if (business) {
          inventoryQuery.business =
            business;
        }
      } else {
        const context =
          await getEffectiveBusinessContext(
            req.user
          );

        if (!context?.business) {
          return res.status(403).json({
            success: false,
            message:
              "Your account is not associated with a business.",
          });
        }

        inventoryQuery.business =
          context.business;
      }

      const inventories =
        await ProductInventory.find(
          inventoryQuery
        );

      const inventoryMap =
        new Map();

      inventories.forEach(
        (inventory) => {
          const productId =
            inventory.product.toString();

          if (
            !inventoryMap.has(
              productId
            )
          ) {
            inventoryMap.set(
              productId,
              []
            );
          }

          inventoryMap
            .get(productId)
            .push(inventory);
        }
      );

      filteredProducts =
        products.filter(
          (product) => {
            const productInventory =
              inventoryMap.get(
                product._id.toString()
              ) || [];

            const quantity =
              productInventory.reduce(
                (
                  totalQuantity,
                  item
                ) =>
                  totalQuantity +
                  Number(
                    item.quantity ||
                      0
                  ),
                0
              );

            const minStock =
              productInventory.length
                ? Math.min(
                    ...productInventory.map(
                      (item) =>
                        Number(
                          item.minStock ||
                            0
                        )
                    )
                  )
                : 0;

            // ------------------------------------------
            // OUT OF STOCK
            // ------------------------------------------

            if (
              stockStatus ===
              "out-of-stock"
            ) {
              return (
                quantity === 0
              );
            }

            // ------------------------------------------
            // LOW STOCK
            // ------------------------------------------

            if (
              stockStatus ===
              "low-stock"
            ) {
              return (
                quantity > 0 &&
                quantity <=
                  minStock
              );
            }

            // ------------------------------------------
            // IN STOCK
            // ------------------------------------------

            if (
              stockStatus ===
              "in-stock"
            ) {
              return (
                quantity > 0
              );
            }

            return true;
          }
        );
    }

    return res.status(200).json({
      success: true,
      message:
        "Products fetched successfully.",
      data: {
        products:
          filteredProducts,

        pagination: {
          page:
            pageNumber,

          limit:
            limitNumber,

          // Preserves existing API behavior.
          total,

          totalPages:
            Math.ceil(
              total /
                limitNumber
            ),
        },
      },
    });
  } catch (error) {
    console.error(
      "Get Products Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch products.",
    });
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
    const productId =
      req.params.id;

    if (
      !isValidObjectId(
        productId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product ID.",
      });
    }

    const query = {
      _id: productId,
    };

    // ==================================================
    // TENANT SECURITY
    // ==================================================

    if (isSuperAdmin(req.user)) {
      // Super Admin can optionally filter
      // by Business / Business Type.

      if (req.query.business) {
        if (
          !isValidObjectId(
            req.query.business
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business ID.",
          });
        }

        query.business =
          req.query.business;
      }

      if (
        req.query.businessType
      ) {
        if (
          !isValidObjectId(
            req.query.businessType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business type ID.",
          });
        }

        query.businessType =
          req.query.businessType;
      }
    } else {
      const context =
        await getEffectiveBusinessContext(
          req.user
        );

      if (!context?.business) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business.",
        });
      }

      if (!context?.businessType) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business type.",
        });
      }

      query.business =
        context.business;

      query.businessType =
        context.businessType;
    }

    // ==================================================
    // FIND PRODUCT
    // ==================================================

    const product =
      await populateProduct(
        Product.findOne(query)
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found.",
      });
    }

    // ==================================================
    // INVENTORY
    // ==================================================

    const inventory =
      await ProductInventory.find({
        product:
          product._id,

        business:
          product.business._id,

        isActive: true,
      }).sort({
        color: 1,
        size: 1,
      });

    return res.status(200).json({
      success: true,
      message:
        "Product fetched successfully.",
      data: {
        product,
        inventory,
      },
    });
  } catch (error) {
    console.error(
      "Get Product Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch product.",
    });
  }
};

// ======================================================
// UPDATE PRODUCT
// ======================================================

export const updateProduct = async (
  req,
  res
) => {
  const uploadedCloudinaryImages = [];

  try {
    const productId =
      req.params.id;

    if (
      !isValidObjectId(
        productId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product ID.",
      });
    }

    const query = {
      _id: productId,
    };

    // ==================================================
    // TENANT SECURITY
    // ==================================================

    let effectiveContext = null;

    if (isSuperAdmin(req.user)) {
      // Super Admin can update any product.

      if (req.query.business) {
        if (
          !isValidObjectId(
            req.query.business
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business ID.",
          });
        }

        query.business =
          req.query.business;
      }

      if (
        req.query.businessType
      ) {
        if (
          !isValidObjectId(
            req.query.businessType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business type ID.",
          });
        }

        query.businessType =
          req.query.businessType;
      }
    } else {
      effectiveContext =
        await getEffectiveBusinessContext(
          req.user
        );

      if (
        !effectiveContext?.business
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business.",
        });
      }

      if (
        !effectiveContext?.businessType
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business type.",
        });
      }

      query.business =
        effectiveContext.business;

      query.businessType =
        effectiveContext.businessType;
    }

    // ==================================================
    // FIND PRODUCT
    // ==================================================

    const product =
      await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found.",
      });
    }

    const businessId =
      product.business;

    // ==================================================
    // FIELDS
    // ==================================================

    const {
      businessType,
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
      isFeatured,
      isActive,
      removeImages,
    } = req.body;

    // ==================================================
    // BUSINESS TYPE
    // ==================================================

    if (isSuperAdmin(req.user)) {
      if (businessType) {
        const result =
          await validateBusinessType(
            businessType,
            businessId
          );

        if (!result.valid) {
          return res.status(400).json({
            success: false,
            message:
              result.message,
          });
        }

        product.businessType =
          result.businessType._id;
      }
    } else {
      // ------------------------------------------------
      // ADMIN / MANAGER
      // ------------------------------------------------
      //
      // Ignore businessType from frontend.
      //
      // This preserves tenant isolation.
      //

      product.businessType =
        effectiveContext.businessType;
    }

    const effectiveBusinessTypeId =
      product.businessType;

    // ==================================================
    // CATEGORY
    // ==================================================

    if (category !== undefined) {
      const result =
        await validateCategory(
          category,
          businessId,
          effectiveBusinessTypeId
        );

      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message:
            result.message,
        });
      }

      product.category =
        result.category._id;
    }

    // ==================================================
    // BRAND
    // ==================================================

    let selectedBrand =
      await Brand.findOne({
        _id: product.brand,
        business: businessId,
        businessType:
          effectiveBusinessTypeId,
        isActive: true,
      });

    if (brand !== undefined) {
      const result =
        await validateBrand(
          brand,
          businessId,
          effectiveBusinessTypeId
        );

      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message:
            result.message,
        });
      }

      product.brand =
        result.brand._id;

      selectedBrand =
        result.brand;
    }

    if (!selectedBrand) {
      return res.status(400).json({
        success: false,
        message:
          "Current product brand is invalid or inactive.",
      });
    }

    // ==================================================
    // MODEL
    // ==================================================

    if (
      model !== undefined
    ) {
      if (
        model === null ||
        model === ""
      ) {
        product.model = null;
      } else {
        const result =
          await validateModel(
            model,
            product.brand,
            businessId,
            effectiveBusinessTypeId
          );

        if (!result.valid) {
          return res.status(400).json({
            success: false,
            message:
              result.message,
          });
        }

        product.model =
          result.model._id;
      }
    } else if (
      brand !== undefined &&
      product.model
    ) {
      // ------------------------------------------------
      // Brand changed but model was not sent.
      //
      // Remove old model if it no longer belongs
      // to the new brand.
      // ------------------------------------------------

      const currentModel =
        await Model.findOne({
          _id: product.model,
          brand: product.brand,
          business: businessId,
          businessType:
            effectiveBusinessTypeId,
          isActive: true,
        });

      if (!currentModel) {
        product.model = null;
      }
    }

    // ==================================================
    // SKU
    // ==================================================

    if (sku !== undefined) {
      const normalizedSku =
        sku?.trim().toUpperCase();

      if (!normalizedSku) {
        return res.status(400).json({
          success: false,
          message:
            "SKU cannot be empty.",
        });
      }

      if (
        normalizedSku !==
        product.sku
      ) {
        const exists =
          await Product.findOne({
            business:
              businessId,

            sku:
              normalizedSku,

            _id: {
              $ne:
                product._id,
            },
          }).select("_id");

        if (exists) {
          return res.status(409).json({
            success: false,
            message:
              "A product with this SKU already exists in this business.",
          });
        }
      }

      product.sku =
        normalizedSku;
    }

    // ==================================================
    // BARCODE
    // ==================================================

    if (
      barcode !== undefined
    ) {
      const normalizedBarcode =
        normalizeBarcode(
          barcode
        );

      // ----------------------------------------------
      // Check duplicate only when a real barcode
      // exists.
      // ----------------------------------------------

      if (normalizedBarcode) {
        const existingBarcode =
          await Product.findOne({
            business:
              businessId,

            barcode:
              normalizedBarcode,

            _id: {
              $ne:
                product._id,
            },
          }).select("_id");

        if (existingBarcode) {
          return res.status(409).json({
            success: false,
            message:
              "A product with this barcode already exists in this business.",
          });
        }
      }

      product.barcode =
        normalizedBarcode;

      // No barcode means CUSTOM.
      if (!normalizedBarcode) {
        product.barcodeType =
          "CUSTOM";
      } else if (
        barcodeType !==
        undefined
      ) {
        product.barcodeType =
          barcodeType;
      }
    } else if (
      barcodeType !== undefined
    ) {
      // Barcode itself was not changed,
      // only barcode type was changed.

      if (product.barcode) {
        product.barcodeType =
          barcodeType;
      } else {
        product.barcodeType =
          "CUSTOM";
      }
    }

    // ==================================================
    // PRODUCT TYPE / VARIANTS
    // ==================================================

    let nextProductType =
      product.productType;

    let nextHasVariants =
      product.hasVariants;

    if (
      productType !==
      undefined
    ) {
      nextProductType =
        productType;
    }

    if (
      hasVariants !==
      undefined
    ) {
      nextHasVariants =
        parseBoolean(
          hasVariants
        );
    } else if (
      productType !==
      undefined
    ) {
      nextHasVariants =
        productType ===
        "variable";
    }

    const productTypeResult =
      validateProductTypeAndVariants(
        nextProductType,
        nextHasVariants
      );

    if (!productTypeResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          productTypeResult.message,
      });
    }

    product.productType =
      nextProductType;

    product.hasVariants =
      nextHasVariants;

    // ==================================================
    // PRODUCT NAME
    // ==================================================

    if (name !== undefined) {
      if (name?.trim()) {
        product.name =
          name.trim();
      } else {
        const modelData =
          product.model
            ? await Model.findOne({
                _id:
                  product.model,

                brand:
                  product.brand,

                business:
                  businessId,

                businessType:
                  effectiveBusinessTypeId,

                isActive:
                  true,
              })
            : null;

        product.name =
          `${selectedBrand.name}${
            modelData
              ? ` ${modelData.name}`
              : ""
          }`;
      }
    } else if (
      brand !== undefined ||
      model !== undefined ||
      businessType !==
        undefined
    ) {
      const brandData =
        await Brand.findOne({
          _id: product.brand,
          business: businessId,
          businessType:
            effectiveBusinessTypeId,
          isActive: true,
        });

      if (!brandData) {
        return res.status(400).json({
          success: false,
          message:
            "Selected brand is invalid.",
        });
      }

      const modelData =
        product.model
          ? await Model.findOne({
              _id:
                product.model,

              brand:
                product.brand,

              business:
                businessId,

              businessType:
                effectiveBusinessTypeId,

              isActive:
                true,
            })
          : null;

      product.name =
        `${brandData.name}${
          modelData
            ? ` ${modelData.name}`
            : ""
        }`;
    }

    // ==================================================
    // SLUG
    // ==================================================

    if (
      slug !== undefined
    ) {
      const normalizedSlug =
        slug?.trim()
          ? slug
              .trim()
              .toLowerCase()
          : product.name
              .trim()
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                "-"
              )
              .replace(
                /^-+|-+$/g,
                ""
              );

      product.slug =
        normalizedSlug;
    }

    // ==================================================
    // BASIC FIELDS
    // ==================================================

    if (
      shortDescription !==
      undefined
    ) {
      product.shortDescription =
        shortDescription
          ?.trim() || "";
    }

    if (
      description !==
      undefined
    ) {
      product.description =
        description?.trim() ||
        "";
    }

    if (
      unit !== undefined
    ) {
      product.unit =
        unit;
    }

    // ==================================================
    // PRICES
    // ==================================================

    if (
      purchasePrice !==
      undefined
    ) {
      const value =
        parseNumber(
          purchasePrice,
          0
        );

      if (value < 0) {
        return res.status(400).json({
          success: false,
          message:
            "Purchase price cannot be negative.",
        });
      }

      product.purchasePrice =
        value;
    }

    if (
      salePrice !==
      undefined
    ) {
      const value =
        parseNumber(
          salePrice,
          0
        );

      if (value < 0) {
        return res.status(400).json({
          success: false,
          message:
            "Sale price cannot be negative.",
        });
      }

      product.salePrice =
        value;
    }

    if (
      discount !==
      undefined
    ) {
      const value =
        parseNumber(
          discount,
          0
        );

      if (
        value < 0 ||
        value > 100
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Discount must be between 0 and 100.",
        });
      }

      product.discount =
        value;
    }

    if (
      tax !== undefined
    ) {
      const value =
        parseNumber(
          tax,
          0
        );

      if (value < 0) {
        return res.status(400).json({
          success: false,
          message:
            "Tax cannot be negative.",
        });
      }

      product.tax =
        value;
    }

    // ==================================================
    // BOOLEAN FIELDS
    // ==================================================

    if (
      isFeatured !==
      undefined
    ) {
      product.isFeatured =
        parseBoolean(
          isFeatured
        );
    }

    if (
      isActive !==
      undefined
    ) {
      product.isActive =
        parseBoolean(
          isActive
        );
    }

    // ==================================================
    // REMOVE OLD IMAGES
    // ==================================================

    if (removeImages) {
      let imageIds =
        removeImages;

      if (
        typeof imageIds ===
        "string"
      ) {
        try {
          imageIds =
            JSON.parse(
              imageIds
            );
        } catch {
          imageIds = [
            imageIds,
          ];
        }
      }

      if (
        Array.isArray(
          imageIds
        )
      ) {
        for (const publicId of imageIds) {
          const imageExists =
            product.images.some(
              (image) =>
                image.publicId ===
                publicId
            );

          if (!imageExists) {
            continue;
          }

          await deleteFromCloudinary(
            publicId
          );

          product.images =
            product.images.filter(
              (image) =>
                image.publicId !==
                publicId
            );
        }
      }
    }

    // ==================================================
    // ADD NEW IMAGES
    // ==================================================

    if (
      req.files &&
      req.files.length > 0
    ) {
      for (const file of req.files) {
        const result =
          await uploadToCloudinary(
            file.buffer,
            "pos/products"
          );

        uploadedCloudinaryImages.push(
          result.public_id
        );

        product.images.push({
          url:
            result.secure_url,

          publicId:
            result.public_id,

          assetId:
            result.asset_id ||
            null,
        });
      }
    }

    // ==================================================
    // UPDATE AUDIT
    // ==================================================

    product.updatedBy =
      req.user._id;

    // ==================================================
    // SAVE PRODUCT
    // ==================================================

    await product.save();

    // ==================================================
    // SYNC DEFAULT INVENTORY
    // ==================================================

    if (
      !product.hasVariants
    ) {
      let inventory =
        await ProductInventory.findOne({
          product:
            product._id,

          business:
            businessId,

          color: null,
          size: null,
        });

      // ------------------------------------------------
      // CREATE INVENTORY IF MISSING
      // ------------------------------------------------

      if (!inventory) {
        inventory =
          await ProductInventory.create({
            business:
              businessId,

            product:
              product._id,

            color: null,
            size: null,

            quantity: 0,
            minStock: 0,
            maxStock: null,

            purchasePrice:
              product.purchasePrice,

            salePrice:
              product.salePrice,

            discount:
              product.discount,

            tax:
              product.tax,

            isActive: true,

            createdBy:
              req.user._id,
          });
      } else {
        // ------------------------------------------------
        // SYNC PRICES
        // ------------------------------------------------

        inventory.purchasePrice =
          product.purchasePrice;

        inventory.salePrice =
          product.salePrice;

        inventory.discount =
          product.discount;

        inventory.tax =
          product.tax;

        inventory.updatedBy =
          req.user._id;

        await inventory.save();
      }
    }

    // ==================================================
    // POPULATE UPDATED PRODUCT
    // ==================================================

    const updatedProduct =
      await populateProduct(
        Product.findById(
          product._id
        )
      );

    return res.status(200).json({
      success: true,
      message:
        "Product updated successfully.",
      data:
        updatedProduct,
    });
  } catch (error) {
    console.error(
      "Update Product Error:",
      error
    );

    // --------------------------------------------------
    // CLEAN UP NEW CLOUDINARY IMAGES IF UPDATE FAILED
    // --------------------------------------------------

    if (
      uploadedCloudinaryImages.length
    ) {
      for (const publicId of uploadedCloudinaryImages) {
        try {
          await deleteFromCloudinary(
            publicId
          );
        } catch (cloudinaryError) {
          console.error(
            "Cloudinary cleanup error:",
            cloudinaryError
          );
        }
      }
    }

    // --------------------------------------------------
    // DUPLICATE KEY
    // --------------------------------------------------

    if (
      handleDuplicateKeyError(
        error,
        res
      )
    ) {
      return;
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to update product.",
    });
  }
};

// ======================================================
// DELETE PRODUCT - SOFT DELETE
// ======================================================

export const deleteProduct = async (
  req,
  res
) => {
  try {
    const productId =
      req.params.id;

    if (
      !isValidObjectId(
        productId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product ID.",
      });
    }

    const query = {
      _id: productId,
    };

    // ==================================================
    // TENANT SECURITY
    // ==================================================

    if (isSuperAdmin(req.user)) {
      if (req.query.business) {
        if (
          !isValidObjectId(
            req.query.business
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business ID.",
          });
        }

        query.business =
          req.query.business;
      }

      if (
        req.query.businessType
      ) {
        if (
          !isValidObjectId(
            req.query.businessType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business type ID.",
          });
        }

        query.businessType =
          req.query.businessType;
      }
    } else {
      const context =
        await getEffectiveBusinessContext(
          req.user
        );

      if (!context?.business) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business.",
        });
      }

      if (!context?.businessType) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business type.",
        });
      }

      query.business =
        context.business;

      query.businessType =
        context.businessType;
    }

    // ==================================================
    // FIND PRODUCT
    // ==================================================

    const product =
      await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found.",
      });
    }

    // ==================================================
    // SOFT DELETE PRODUCT
    // ==================================================

    product.isActive =
      false;

    product.updatedBy =
      req.user._id;

    await product.save();

    // ==================================================
    // SOFT DELETE INVENTORY
    // ==================================================

    await ProductInventory.updateMany(
      {
        product:
          product._id,

        business:
          product.business,
      },
      {
        $set: {
          isActive:
            false,

          updatedBy:
            req.user._id,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "Product deleted successfully.",
    });
  } catch (error) {
    console.error(
      "Delete Product Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to delete product.",
    });
  }
};

// ======================================================
// RESTORE PRODUCT
// ======================================================

export const restoreProduct = async (
  req,
  res
) => {
  try {
    const productId =
      req.params.id;

    if (
      !isValidObjectId(
        productId
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid product ID.",
      });
    }

    const query = {
      _id: productId,
    };

    // ==================================================
    // TENANT SECURITY
    // ==================================================

    if (isSuperAdmin(req.user)) {
      if (req.query.business) {
        if (
          !isValidObjectId(
            req.query.business
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business ID.",
          });
        }

        query.business =
          req.query.business;
      }

      if (
        req.query.businessType
      ) {
        if (
          !isValidObjectId(
            req.query.businessType
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid business type ID.",
          });
        }

        query.businessType =
          req.query.businessType;
      }
    } else {
      const context =
        await getEffectiveBusinessContext(
          req.user
        );

      if (!context?.business) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business.",
        });
      }

      if (!context?.businessType) {
        return res.status(403).json({
          success: false,
          message:
            "Your account is not associated with a business type.",
        });
      }

      query.business =
        context.business;

      query.businessType =
        context.businessType;
    }

    // ==================================================
    // FIND PRODUCT
    // ==================================================

    const product =
      await Product.findOne(query);

    if (!product) {
      return res.status(404).json({
        success: false,
        message:
          "Product not found.",
      });
    }

    // ==================================================
    // CHECK SKU CONFLICT
    // ==================================================

    const skuConflict =
      await Product.findOne({
        business:
          product.business,

        sku:
          product.sku,

        _id: {
          $ne:
            product._id,
        },

        isActive: true,
      }).select("_id");

    if (skuConflict) {
      return res.status(409).json({
        success: false,
        message:
          "This product cannot be restored because another active product already uses the same SKU in this business.",
      });
    }

    // ==================================================
    // CHECK BARCODE CONFLICT
    // ==================================================

    if (product.barcode) {
      const barcodeConflict =
        await Product.findOne({
          business:
            product.business,

          barcode:
            product.barcode,

          _id: {
            $ne:
              product._id,
          },

          isActive: true,
        }).select("_id");

      if (barcodeConflict) {
        return res.status(409).json({
          success: false,
          message:
            "This product cannot be restored because another active product already uses the same barcode in this business.",
        });
      }
    }

    // ==================================================
    // VALIDATE CURRENT BUSINESS
    // ==================================================

    const businessResult =
      await validateBusiness(
        product.business
      );

    if (!businessResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          "The product's business is inactive or no longer available.",
      });
    }

    // ==================================================
    // VALIDATE CURRENT BUSINESS TYPE
    // ==================================================

    const businessTypeResult =
      await validateBusinessType(
        product.businessType,
        product.business
      );

    if (!businessTypeResult.valid) {
      return res.status(400).json({
        success: false,
        message:
          "The product's business type is inactive or no longer belongs to this business.",
      });
    }

    // ==================================================
    // RESTORE PRODUCT
    // ==================================================

    product.isActive =
      true;

    product.updatedBy =
      req.user._id;

    await product.save();

    // ==================================================
    // RESTORE INVENTORY
    // ==================================================

    await ProductInventory.updateMany(
      {
        product:
          product._id,

        business:
          product.business,
      },
      {
        $set: {
          isActive:
            true,

          updatedBy:
            req.user._id,
        },
      }
    );

    // ==================================================
    // POPULATE
    // ==================================================

    const restoredProduct =
      await populateProduct(
        Product.findById(
          product._id
        )
      );

    return res.status(200).json({
      success: true,
      message:
        "Product restored successfully.",
      data:
        restoredProduct,
    });
  } catch (error) {
    console.error(
      "Restore Product Error:",
      error
    );

    // --------------------------------------------------
    // DUPLICATE KEY
    // --------------------------------------------------

    if (
      handleDuplicateKeyError(
        error,
        res
      )
    ) {
      return;
    }

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to restore product.",
    });
  }
};