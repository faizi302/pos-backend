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

    return String(value).toLowerCase() === "true";
};

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

const normalizeBarcode = (value) => {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    const barcode = String(value).trim();

    return barcode || null;
};

const normalizeSku = (value) => {
    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value)
        .trim()
        .toUpperCase();
};

const makeSlug = (value = "") => {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
};

// ======================================================
// PRODUCT POPULATE
// ======================================================

const populateProduct = (query) => {
    return query
        .populate({
            path: "tenantOwner",
            select: "name email",
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
            path: "category",
            select: "name slug",
        })
        .populate({
            path: "brand",
            select: "name",
        })
        .populate({
            path: "model",
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
//
// ADMIN
// → tenantOwner = Admin._id
// → business = Admin.business
// → businessType = Admin.businessType
//
// MANAGER
// → tenantOwner = Manager's Admin ID
// → business = Admin.business
// → businessType = Admin.businessType
//
// SUPER ADMIN
// → tenantOwner can be supplied to work with a
//   specific Admin tenant.
//
// IMPORTANT:
// For Admin/Manager, tenantOwner/business/businessType
// NEVER come from req.body or req.query.
// ======================================================

const resolveTenant = async (
    req,
    requireOwner = true
) => {
    const context =
        await getTenantContext(req);

    // --------------------------------------------------
    // SUPER ADMIN
    // --------------------------------------------------

    if (context.isSuperAdmin) {
        const requestedTenantOwner =
            req.body?.tenantOwner ||
            req.query?.tenantOwner;

        if (
            requireOwner &&
            !requestedTenantOwner
        ) {
            return {
                error:
                    "Tenant owner is required.",
            };
        }

        if (
            requestedTenantOwner &&
            !isValidObjectId(
                requestedTenantOwner
            )
        ) {
            return {
                error:
                    "Invalid tenant owner ID.",
            };
        }

        // Super Admin without a selected tenant
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

        // ----------------------------------------------
        // Validate selected Admin
        // ----------------------------------------------

        const admin =
            await User.findById(
                requestedTenantOwner
            )
                .select(
                    "_id role business businessType status"
                )
                .populate({
                    path: "role",
                    select: "slug",
                });

        if (!admin) {
            return {
                error:
                    "Tenant owner not found.",
            };
        }

        const roleSlug =
            admin.role?.slug?.toLowerCase();

        if (roleSlug !== "admin") {
            return {
                error:
                    "Tenant owner must be an Admin.",
            };
        }

        if (admin.status !== "active") {
            return {
                error:
                    "Tenant owner account is not active.",
            };
        }

        if (!admin.business) {
            return {
                error:
                    "Tenant owner is not assigned to a business.",
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

    // --------------------------------------------------
    // ADMIN / MANAGER
    // --------------------------------------------------

    if (!context.tenantOwner) {
        return {
            error:
                "Your account is not associated with a tenant.",
        };
    }

    if (
        !context.business ||
        !context.businessType
    ) {
        return {
            error:
                "Your account is not associated with a business and business type.",
        };
    }

    return {
        context,
        tenantOwner:
            context.tenantOwner,
        business:
            context.business,
        businessType:
            context.businessType,
    };
};

// ======================================================
// VALIDATE BUSINESS
// ======================================================

const validateBusiness = async (
    businessId
) => {
    if (
        !isValidObjectId(
            businessId
        )
    ) {
        return null;
    }

    return Business.findOne({
        _id: businessId,
        isActive: true,
    });
};

// ======================================================
// VALIDATE BUSINESS TYPE
// ======================================================

const validateBusinessType = async (
    businessTypeId,
    businessId
) => {
    if (
        !isValidObjectId(
            businessTypeId
        ) ||
        !isValidObjectId(
            businessId
        )
    ) {
        return null;
    }

    return BusinessType.findOne({
        _id: businessTypeId,
        business: businessId,
        isActive: true,
    });
};

// ======================================================
// VALIDATE CATEGORY
// ======================================================
//
// Category is TENANT-OWNED.
//
// Therefore:
// tenantOwner + business + businessType
// must match the current tenant.
//
// ======================================================

const validateCategory = async (
    categoryId,
    tenantOwner,
    businessId,
    businessTypeId
) => {
    if (
        !isValidObjectId(
            categoryId
        ) ||
        !tenantOwner ||
        !businessId ||
        !businessTypeId
    ) {
        return null;
    }

    return Category.findOne({
        _id: categoryId,
        tenantOwner,
        business: businessId,
        isActive: true,

        $or: [
            {
                businessType:
                    businessTypeId,
            },
            {
                businessType: null,
            },
        ],
    });
};

// ======================================================
// VALIDATE BRAND
// ======================================================
//
// IMPORTANT:
//
// Brand is MASTER DATA created by Super Admin.
//
// Brand does NOT have tenantOwner.
//
// Therefore DO NOT use:
//
// tenantOwner: tenantOwner
//
// Instead validate:
//
// business + businessType
//
// ======================================================

const validateBrand = async (
    brandId,
    businessId,
    businessTypeId
) => {
    if (
        !isValidObjectId(
            brandId
        ) ||
        !isValidObjectId(
            businessId
        ) ||
        !isValidObjectId(
            businessTypeId
        )
    ) {
        return null;
    }

    return Brand.findOne({
        _id: brandId,
        business: businessId,
        businessType: businessTypeId,
        isActive: true,
    });
};

// ======================================================
// VALIDATE MODEL
// ======================================================
//
// Model is MASTER DATA created by Super Admin.
//
// Model does NOT use tenantOwner.
//
// It must belong to:
// business
// businessType
// selected brand
//
// ======================================================

const validateModel = async (
    modelId,
    businessId,
    businessTypeId,
    brandId
) => {
    if (
        !modelId
    ) {
        return null;
    }

    if (
        !isValidObjectId(
            modelId
        )
    ) {
        return false;
    }

    if (
        !isValidObjectId(
            businessId
        ) ||
        !isValidObjectId(
            businessTypeId
        ) ||
        !isValidObjectId(
            brandId
        )
    ) {
        return null;
    }

    return Model.findOne({
        _id: modelId,
        business: businessId,
        businessType: businessTypeId,
        brand: brandId,
        isActive: true,
    });
};

// ======================================================
// DUPLICATE ERROR
// ======================================================

const handleDuplicateError = (
    error,
    res
) => {
    if (
        error?.code !== 11000
    ) {
        return false;
    }

    const keys =
        Object.keys(
            error.keyPattern || {}
        );

    if (
        keys.includes("sku")
    ) {
        errorResponse(
            res,
            409,
            "A product with this SKU already exists in this tenant."
        );

        return true;
    }

    if (
        keys.includes("barcode")
    ) {
        errorResponse(
            res,
            409,
            "A product with this barcode already exists in this tenant."
        );

        return true;
    }

    errorResponse(
        res,
        409,
        "A product with the same unique value already exists."
    );

    return true;
};

// ======================================================
// CREATE PRODUCT
// ======================================================

export const createProduct = async (
    req,
    res
) => {
    const uploadedImages = [];

    try {
        const tenant =
            await resolveTenant(
                req,
                true
            );

        if (
            tenant.error
        ) {
            return errorResponse(
                res,
                400,
                tenant.error
            );
        }

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
        } = req.body;

        const {
            tenantOwner,
            business,
            businessType,
        } = tenant;

        // ==================================================
        // BUSINESS
        // ==================================================

        const businessDoc =
            await validateBusiness(
                business
            );

        if (!businessDoc) {
            return errorResponse(
                res,
                400,
                "Business not found or inactive."
            );
        }

        // ==================================================
        // BUSINESS TYPE
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
        // CATEGORY
        // ==================================================

        const categoryDoc =
            await validateCategory(
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
        // BRAND
        // ==================================================
        //
        // Brand is Super Admin master data.
        //
        // NO tenantOwner check here.
        //
        // ==================================================

        const brandDoc =
            await validateBrand(
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
        // MODEL
        // ==================================================

        const modelDoc =
            await validateModel(
                model,
                business,
                businessType,
                brand
            );

        if (
            model &&
            modelDoc === false
        ) {
            return errorResponse(
                res,
                400,
                "Invalid model ID."
            );
        }

        if (
            model &&
            !modelDoc
        ) {
            return errorResponse(
                res,
                400,
                "Model not found or does not belong to the selected brand and business type."
            );
        }

        // ==================================================
        // SKU
        // ==================================================

        const normalizedSku =
            normalizeSku(sku);

        if (!normalizedSku) {
            return errorResponse(
                res,
                400,
                "SKU is required."
            );
        }

        const existingSku =
            await Product.findOne({
                tenantOwner,
                sku: normalizedSku,
            }).select("_id");

        if (existingSku) {
            return errorResponse(
                res,
                409,
                "A product with this SKU already exists in this tenant."
            );
        }

        // ==================================================
        // BARCODE
        // ==================================================

        const normalizedBarcode =
            normalizeBarcode(
                barcode
            );

        if (
            normalizedBarcode
        ) {
            const existingBarcode =
                await Product.findOne({
                    tenantOwner,
                    barcode:
                        normalizedBarcode,
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
        // PRODUCT TYPE
        // ==================================================

        const parsedHasVariants =
            parseBoolean(
                hasVariants,
                productType ===
                    "variable"
            );

        if (
            productType ===
                "simple" &&
            parsedHasVariants
        ) {
            return errorResponse(
                res,
                400,
                "A simple product cannot have variants."
            );
        }

        if (
            productType ===
                "variable" &&
            !parsedHasVariants
        ) {
            return errorResponse(
                res,
                400,
                "A variable product must have variants."
            );
        }

        // ==================================================
        // PRICES
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

        if (
            parsedTax < 0
        ) {
            return errorResponse(
                res,
                400,
                "Tax cannot be negative."
            );
        }

        // ==================================================
        // PRODUCT NAME
        // ==================================================

        const productName =
            name?.trim() ||
            `${brandDoc.name}${
                modelDoc
                    ? ` ${modelDoc.name}`
                    : ""
            }`;

        // ==================================================
        // SLUG
        // ==================================================

        const productSlug =
            slug?.trim()
                ? slug
                      .trim()
                      .toLowerCase()
                : makeSlug(
                      productName
                  );

        // ==================================================
        // IMAGES
        // ==================================================

        if (
            req.files?.length
        ) {
            for (
                const file of req.files
            ) {
                const result =
                    await uploadToCloudinary(
                        file.buffer,
                        "pos/products"
                    );

                uploadedImages.push({
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
        // CREATE PRODUCT
        // ==================================================
        //
        // IMPORTANT:
        //
        // tenantOwner/business/businessType come from
        // authenticated tenant context.
        //
        // They are NOT trusted from req.body.
        //
        // ==================================================

        const product =
            await Product.create({
                tenantOwner,

                business,

                businessType,

                category:
                    categoryDoc._id,

                brand:
                    brandDoc._id,

                model:
                    modelDoc?._id ||
                    null,

                name:
                    productName,

                slug:
                    productSlug,

                sku:
                    normalizedSku,

                barcode:
                    normalizedBarcode,

                barcodeType:
                    normalizedBarcode
                        ? barcodeType ||
                          "CUSTOM"
                        : "CUSTOM",

                shortDescription:
                    shortDescription?.trim() ||
                    "",

                description:
                    description?.trim() ||
                    "",

                images:
                    uploadedImages,

                productType,

                hasVariants:
                    parsedHasVariants,

                unit,

                purchasePrice:
                    parsedPurchasePrice,

                salePrice:
                    parsedSalePrice,

                discount:
                    parsedDiscount,

                tax:
                    parsedTax,

                isFeatured:
                    parseBoolean(
                        isFeatured,
                        false
                    ),

                isActive:
                    parseBoolean(
                        isActive,
                        true
                    ),

                createdBy:
                    req.user._id,
            });

        // ==================================================
        // DEFAULT INVENTORY
        // ==================================================

        if (
            !parsedHasVariants
        ) {
            await ProductInventory.create({
                business,

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
        // POPULATE
        // ==================================================

        const populated =
            await populateProduct(
                Product.findById(
                    product._id
                )
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

        for (
            const image of uploadedImages
        ) {
            if (
                !image?.publicId
            ) {
                continue;
            }

            try {
                await deleteFromCloudinary(
                    image.publicId
                );
            } catch {}
        }

        if (
            handleDuplicateError(
                error,
                res
            )
        ) {
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
        const tenant =
            await resolveTenant(
                req,
                false
            );

        if (
            tenant.error
        ) {
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
        } = req.query;

        const query = {};

        // ==================================================
        // TENANT ISOLATION
        // ==================================================

        if (
            !context.isSuperAdmin
        ) {
            query.tenantOwner =
                tenantOwner;

            // ----------------------------------------------
            // For Admin/Manager, business context also comes
            // from authenticated user.
            // ----------------------------------------------

            query.business =
                business;

            query.businessType =
                businessType;
        } else if (
            tenantOwner
        ) {
            query.tenantOwner =
                tenantOwner;

            // ----------------------------------------------
            // Super Admin can inspect selected tenant.
            // ----------------------------------------------

            if (
                business
            ) {
                query.business =
                    business;
            }

            if (
                businessType
            ) {
                query.businessType =
                    businessType;
            }
        }

        // ==================================================
        // SEARCH
        // ==================================================

        if (
            search?.trim()
        ) {
            const value =
                search.trim();

            query.$or = [
                {
                    name: {
                        $regex:
                            value,
                        $options:
                            "i",
                    },
                },
                {
                    sku: {
                        $regex:
                            value,
                        $options:
                            "i",
                    },
                },
                {
                    barcode: {
                        $regex:
                            value,
                        $options:
                            "i",
                    },
                },
            ];
        }

        // ==================================================
        // CATEGORY / BRAND / MODEL FILTERS
        // ==================================================

        for (
            const [
                field,
                value,
            ] of [
                ["category", category],
                ["brand", brand],
                ["model", model],
            ]
        ) {
            if (
                value
            ) {
                if (
                    !isValidObjectId(
                        value
                    )
                ) {
                    return errorResponse(
                        res,
                        400,
                        `Invalid ${field} ID.`
                    );
                }

                query[field] =
                    value;
            }
        }

        // ==================================================
        // PRODUCT TYPE
        // ==================================================

        if (
            productType
        ) {
            query.productType =
                productType;
        }

        // ==================================================
        // ACTIVE STATUS
        // ==================================================

        if (
            isActive !==
            undefined
        ) {
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
                    Number(limit) ||
                        20,
                    1
                ),
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
                Product.find(
                    query
                )
                    .sort({
                        createdAt:
                            -1,
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
        // STOCK FILTER
        // ==================================================

        let result =
            products;

        if (
            stockStatus
        ) {
            if (
                ![
                    "out-of-stock",
                    "low-stock",
                    "in-stock",
                ].includes(
                    stockStatus
                )
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid stock status."
                );
            }

            const productIds =
                products.map(
                    (item) =>
                        item._id
                );

            const inventoryQuery = {
                product: {
                    $in:
                        productIds,
                },
                isActive: true,
            };

            // ProductInventory currently uses business
            // as its available tenant context.
            if (
                business
            ) {
                inventoryQuery.business =
                    business;
            }

            const inventories =
                await ProductInventory.find(
                    inventoryQuery
                );

            const inventoryMap =
                new Map();

            for (
                const inventory of inventories
            ) {
                const id =
                    inventory.product.toString();

                if (
                    !inventoryMap.has(
                        id
                    )
                ) {
                    inventoryMap.set(
                        id,
                        []
                    );
                }

                inventoryMap
                    .get(id)
                    .push(
                        inventory
                    );
            }

            result =
                products.filter(
                    (
                        product
                    ) => {
                        const items =
                            inventoryMap.get(
                                product._id.toString()
                            ) || [];

                        const quantity =
                            items.reduce(
                                (
                                    total,
                                    item
                                ) =>
                                    total +
                                    Number(
                                        item.quantity ||
                                            0
                                    ),
                                0
                            );

                        const minStock =
                            items.length
                                ? Math.min(
                                      ...items.map(
                                          (
                                              item
                                          ) =>
                                              Number(
                                                  item.minStock ||
                                                      0
                                              )
                                      )
                                  )
                                : 0;

                        if (
                            stockStatus ===
                            "out-of-stock"
                        ) {
                            return (
                                quantity ===
                                0
                            );
                        }

                        if (
                            stockStatus ===
                            "low-stock"
                        ) {
                            return (
                                quantity >
                                    0 &&
                                quantity <=
                                    minStock
                            );
                        }

                        return (
                            quantity > 0
                        );
                    }
                );
        }

        return successResponse(
            res,
            200,
            "Products fetched successfully.",
            {
                products:
                    result,

                pagination: {
                    page:
                        pageNumber,

                    limit:
                        limitNumber,

                    total,

                    totalPages:
                        Math.ceil(
                            total /
                                limitNumber
                        ),
                },
            }
        );
    } catch (error) {
        console.error(
            "Get Products Error:",
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
        const id =
            req.params.id;

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid product ID."
            );
        }

        const tenant =
            await resolveTenant(
                req,
                false
            );

        if (
            tenant.error
        ) {
            return errorResponse(
                res,
                400,
                tenant.error
            );
        }

        const query = {
            _id: id,
        };

        // ==================================================
        // TENANT ISOLATION
        // ==================================================

        if (
            tenant.tenantOwner
        ) {
            query.tenantOwner =
                tenant.tenantOwner;
        }

        if (
            tenant.business
        ) {
            query.business =
                tenant.business;
        }

        if (
            tenant.businessType
        ) {
            query.businessType =
                tenant.businessType;
        }

        const product =
            await populateProduct(
                Product.findOne(
                    query
                )
            );

        if (!product) {
            return errorResponse(
                res,
                404,
                "Product not found."
            );
        }

        // ==================================================
        // INVENTORY
        // ==================================================

        const productBusinessId =
            product.business?._id ||
            product.business;

        const inventory =
            await ProductInventory.find(
                {
                    product:
                        product._id,

                    business:
                        productBusinessId,

                    isActive: true,
                }
            ).sort({
                color: 1,
                size: 1,
            });

        return successResponse(
            res,
            200,
            "Product fetched successfully.",
            {
                product,
                inventory,
            }
        );
    } catch (error) {
        console.error(
            "Get Product Error:",
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
        const id =
            req.params.id;

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid product ID."
            );
        }

        const tenant =
            await resolveTenant(
                req,
                false
            );

        if (
            tenant.error
        ) {
            return errorResponse(
                res,
                400,
                tenant.error
            );
        }

        // ==================================================
        // FIND PRODUCT WITH TENANT ISOLATION
        // ==================================================

        const query = {
            _id: id,
        };

        if (
            tenant.tenantOwner
        ) {
            query.tenantOwner =
                tenant.tenantOwner;
        }

        if (
            tenant.business
        ) {
            query.business =
                tenant.business;
        }

        if (
            tenant.businessType
        ) {
            query.businessType =
                tenant.businessType;
        }

        const product =
            await Product.findOne(
                query
            );

        if (!product) {
            return errorResponse(
                res,
                404,
                "Product not found."
            );
        }

        // ==================================================
        // PRODUCT'S ORIGINAL TENANT CONTEXT
        // ==================================================

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

            // ------------------------------------------------
            // These may arrive from frontend, but are ignored.
            // ------------------------------------------------
            business,
            businessType,
            tenantOwner:
                requestedTenantOwner,
        } = req.body;

        // ==================================================
        // PROTECT TENANT OWNERSHIP
        // ==================================================
        //
        // Admin/Manager cannot move a product to another
        // tenant/business/business type.
        //
        // Super Admin can manage selected tenant, but the
        // existing product ownership remains unchanged.
        //
        // ==================================================

        if (
            !tenant.context.isSuperAdmin
        ) {
            if (
                business !==
                undefined ||
                businessType !==
                undefined ||
                requestedTenantOwner !==
                undefined
            ) {
                // We simply ignore these values rather than
                // allowing them to modify tenant ownership.
            }
        }

        // ==================================================
        // VALIDATE PRODUCT BUSINESS
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

        if (
            category !==
            undefined
        ) {
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
        //
        // Brand is MASTER DATA.
        //
        // No tenantOwner check.
        //
        // ==================================================

        if (
            brand !==
            undefined
        ) {
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

            // ------------------------------------------------
            // Existing model may no longer belong to new brand
            // ------------------------------------------------

            if (
                product.model
            ) {
                const currentModel =
                    await validateModel(
                        product.model,
                        businessId,
                        businessTypeId,
                        brandDoc._id
                    );

                if (
                    !currentModel
                ) {
                    product.model =
                        null;
                }
            }
        }

        // ==================================================
        // MODEL
        // ==================================================

        if (
            model !==
            undefined
        ) {
            if (
                model ===
                    null ||
                model ===
                    ""
            ) {
                product.model =
                    null;
            } else {
                const modelDoc =
                    await validateModel(
                        model,
                        businessId,
                        businessTypeId,
                        product.brand
                    );

                if (
                    !modelDoc
                ) {
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
        // SKU
        // ==================================================

        if (
            sku !==
            undefined
        ) {
            const normalizedSku =
                normalizeSku(
                    sku
                );

            if (!normalizedSku) {
                return errorResponse(
                    res,
                    400,
                    "SKU cannot be empty."
                );
            }

            if (
                normalizedSku !==
                product.sku
            ) {
                const exists =
                    await Product.findOne(
                        {
                            tenantOwner,

                            sku:
                                normalizedSku,

                            _id: {
                                $ne:
                                    product._id,
                            },
                        }
                    ).select(
                        "_id"
                    );

                if (exists) {
                    return errorResponse(
                        res,
                        409,
                        "A product with this SKU already exists in this tenant."
                    );
                }
            }

            product.sku =
                normalizedSku;
        }

        // ==================================================
        // BARCODE
        // ==================================================

        if (
            barcode !==
            undefined
        ) {
            const normalizedBarcode =
                normalizeBarcode(
                    barcode
                );

            if (
                normalizedBarcode
            ) {
                const exists =
                    await Product.findOne(
                        {
                            tenantOwner,

                            barcode:
                                normalizedBarcode,

                            _id: {
                                $ne:
                                    product._id,
                            },
                        }
                    ).select(
                        "_id"
                    );

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
            barcodeType !==
            undefined
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
            productType !==
            undefined
                ? productType
                : product.productType;

        const nextVariants =
            hasVariants !==
            undefined
                ? parseBoolean(
                      hasVariants
                  )
                : productType !==
                  undefined
                ? productType ===
                  "variable"
                : product.hasVariants;

        if (
            nextType ===
                "simple" &&
            nextVariants
        ) {
            return errorResponse(
                res,
                400,
                "A simple product cannot have variants."
            );
        }

        if (
            nextType ===
                "variable" &&
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
        // NAME
        // ==================================================

        if (
            name !==
            undefined
        ) {
            const trimmedName =
                name.trim();

            if (!trimmedName) {
                return errorResponse(
                    res,
                    400,
                    "Product name cannot be empty."
                );
            }

            product.name =
                trimmedName;
        }

        // ==================================================
        // SLUG
        // ==================================================

        if (
            slug !==
            undefined
        ) {
            product.slug =
                slug.trim()
                    ? slug
                          .trim()
                          .toLowerCase()
                    : makeSlug(
                          product.name
                      );
        }

        // ==================================================
        // TEXT
        // ==================================================

        if (
            shortDescription !==
            undefined
        ) {
            product.shortDescription =
                shortDescription.trim();
        }

        if (
            description !==
            undefined
        ) {
            product.description =
                description.trim();
        }

        // ==================================================
        // UNIT
        // ==================================================

        if (
            unit !==
            undefined
        ) {
            product.unit =
                unit;
        }

        // ==================================================
        // PURCHASE PRICE
        // ==================================================

        if (
            purchasePrice !==
            undefined
        ) {
            const value =
                parseNumber(
                    purchasePrice
                );

            if (
                value < 0
            ) {
                return errorResponse(
                    res,
                    400,
                    "Purchase price cannot be negative."
                );
            }

            product.purchasePrice =
                value;
        }

        // ==================================================
        // SALE PRICE
        // ==================================================

        if (
            salePrice !==
            undefined
        ) {
            const value =
                parseNumber(
                    salePrice
                );

            if (
                value < 0
            ) {
                return errorResponse(
                    res,
                    400,
                    "Sale price cannot be negative."
                );
            }

            product.salePrice =
                value;
        }

        // ==================================================
        // DISCOUNT
        // ==================================================

        if (
            discount !==
            undefined
        ) {
            const value =
                parseNumber(
                    discount
                );

            if (
                value < 0 ||
                value > 100
            ) {
                return errorResponse(
                    res,
                    400,
                    "Discount must be between 0 and 100."
                );
            }

            product.discount =
                value;
        }

        // ==================================================
        // TAX
        // ==================================================

        if (
            tax !==
            undefined
        ) {
            const value =
                parseNumber(
                    tax
                );

            if (
                value < 0
            ) {
                return errorResponse(
                    res,
                    400,
                    "Tax cannot be negative."
                );
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
        // REMOVE IMAGES
        // ==================================================

        if (
            removeImages
        ) {
            let images =
                removeImages;

            if (
                typeof images ===
                "string"
            ) {
                try {
                    images =
                        JSON.parse(
                            images
                        );
                } catch {
                    images = [
                        images,
                    ];
                }
            }

            if (
                Array.isArray(
                    images
                )
            ) {
                for (
                    const publicId of images
                ) {
                    if (
                        !publicId
                    ) {
                        continue;
                    }

                    const exists =
                        product.images.some(
                            (
                                image
                            ) =>
                                image.publicId ===
                                publicId
                        );

                    if (
                        !exists
                    ) {
                        continue;
                    }

                    await deleteFromCloudinary(
                        publicId
                    );

                    product.images =
                        product.images.filter(
                            (
                                image
                            ) =>
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
            req.files?.length
        ) {
            for (
                const file of req.files
            ) {
                const result =
                    await uploadToCloudinary(
                        file.buffer,
                        "pos/products"
                    );

                newUploadedImages.push(
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
        // AUDIT
        // ==================================================

        product.updatedBy =
            req.user._id;

        // ==================================================
        // SAVE
        // ==================================================

        await product.save();

        // ==================================================
        // INVENTORY
        // ==================================================

        if (
            !product.hasVariants
        ) {
            let inventory =
                await ProductInventory.findOne(
                    {
                        product:
                            product._id,

                        business:
                            businessId,

                        color: null,
                        size: null,
                    }
                );

            if (!inventory) {
                await ProductInventory.create(
                    {
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
                    }
                );
            } else {
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
        // RETURN UPDATED PRODUCT
        // ==================================================

        const updated =
            await populateProduct(
                Product.findById(
                    product._id
                )
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
        // CLEANUP NEW CLOUDINARY IMAGES
        // ==================================================

        for (
            const publicId of newUploadedImages
        ) {
            try {
                await deleteFromCloudinary(
                    publicId
                );
            } catch {}
        }

        if (
            handleDuplicateError(
                error,
                res
            )
        ) {
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
// DELETE PRODUCT
// ======================================================

export const deleteProduct = async (
    req,
    res
) => {
    try {
        const id =
            req.params.id;

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid product ID."
            );
        }

        const tenant =
            await resolveTenant(
                req,
                false
            );

        if (
            tenant.error
        ) {
            return errorResponse(
                res,
                400,
                tenant.error
            );
        }

        // ==================================================
        // TENANT FILTER
        // ==================================================

        const query = {
            _id: id,
        };

        if (
            tenant.tenantOwner
        ) {
            query.tenantOwner =
                tenant.tenantOwner;
        }

        if (
            tenant.business
        ) {
            query.business =
                tenant.business;
        }

        if (
            tenant.businessType
        ) {
            query.businessType =
                tenant.businessType;
        }

        const product =
            await Product.findOne(
                query
            );

        if (!product) {
            return errorResponse(
                res,
                404,
                "Product not found."
            );
        }

        // ==================================================
        // SOFT DELETE
        // ==================================================

        product.isActive =
            false;

        product.updatedBy =
            req.user._id;

        await product.save();

        // ==================================================
        // DISABLE INVENTORY
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

        return successResponse(
            res,
            200,
            "Product deleted successfully."
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

// ======================================================
// RESTORE PRODUCT
// ======================================================

export const restoreProduct = async (
    req,
    res
) => {
    try {
        const id =
            req.params.id;

        if (
            !isValidObjectId(id)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid product ID."
            );
        }

        const tenant =
            await resolveTenant(
                req,
                false
            );

        if (
            tenant.error
        ) {
            return errorResponse(
                res,
                400,
                tenant.error
            );
        }

        // ==================================================
        // TENANT FILTER
        // ==================================================

        const query = {
            _id: id,
        };

        if (
            tenant.tenantOwner
        ) {
            query.tenantOwner =
                tenant.tenantOwner;
        }

        if (
            tenant.business
        ) {
            query.business =
                tenant.business;
        }

        if (
            tenant.businessType
        ) {
            query.businessType =
                tenant.businessType;
        }

        const product =
            await Product.findOne(
                query
            );

        if (!product) {
            return errorResponse(
                res,
                404,
                "Product not found."
            );
        }

        // ==================================================
        // SKU CONFLICT
        // ==================================================

        const skuConflict =
            await Product.findOne({
                tenantOwner:
                    product.tenantOwner,

                sku:
                    product.sku,

                _id: {
                    $ne:
                        product._id,
                },

                isActive: true,
            }).select(
                "_id"
            );

        if (
            skuConflict
        ) {
            return errorResponse(
                res,
                409,
                "This product cannot be restored because another active product already uses the same SKU in this tenant."
            );
        }

        // ==================================================
        // BARCODE CONFLICT
        // ==================================================

        if (
            product.barcode
        ) {
            const barcodeConflict =
                await Product.findOne({
                    tenantOwner:
                        product.tenantOwner,

                    barcode:
                        product.barcode,

                    _id: {
                        $ne:
                            product._id,
                    },

                    isActive: true,
                }).select(
                    "_id"
                );

            if (
                barcodeConflict
            ) {
                return errorResponse(
                    res,
                    409,
                    "This product cannot be restored because another active product already uses the same barcode in this tenant."
                );
            }
        }

        // ==================================================
        // VALIDATE BUSINESS
        // ==================================================

        const business =
            await validateBusiness(
                product.business
            );

        if (!business) {
            return errorResponse(
                res,
                400,
                "Product business is inactive or unavailable."
            );
        }

        // ==================================================
        // VALIDATE BUSINESS TYPE
        // ==================================================

        const businessType =
            await validateBusinessType(
                product.businessType,
                product.business
            );

        if (!businessType) {
            return errorResponse(
                res,
                400,
                "Product business type is inactive or unavailable."
            );
        }

        // ==================================================
        // VALIDATE BRAND
        // ==================================================

        const brand =
            await validateBrand(
                product.brand,
                product.business,
                product.businessType
            );

        if (!brand) {
            return errorResponse(
                res,
                400,
                "Product brand is inactive or unavailable."
            );
        }

        // ==================================================
        // VALIDATE MODEL
        // ==================================================

        if (
            product.model
        ) {
            const model =
                await validateModel(
                    product.model,
                    product.business,
                    product.businessType,
                    product.brand
                );

            if (!model) {
                return errorResponse(
                    res,
                    400,
                    "Product model is inactive, unavailable, or does not belong to the selected brand."
                );
            }
        }

        // ==================================================
        // VALIDATE CATEGORY
        // ==================================================

        const category =
            await validateCategory(
                product.category,
                product.tenantOwner,
                product.business,
                product.businessType
            );

        if (!category) {
            return errorResponse(
                res,
                400,
                "Product category is inactive or unavailable for this tenant."
            );
        }

        // ==================================================
        // RESTORE
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
        // RETURN RESTORED PRODUCT
        // ==================================================

        const restored =
            await populateProduct(
                Product.findById(
                    product._id
                )
            );

        return successResponse(
            res,
            200,
            "Product restored successfully.",
            restored
        );
    } catch (error) {
        console.error(
            "Restore Product Error:",
            error
        );

        if (
            handleDuplicateError(
                error,
                res
            )
        ) {
            return;
        }

        return errorResponse(
            res,
            500,
            error.message ||
                "Failed to restore product."
        );
    }
};
