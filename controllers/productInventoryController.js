
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import User from "../models/User.js";

import {
    successResponse,
    errorResponse,
} from "../utils/apiResponse.js";

import {
    getTenantContext,
    buildProductInventoryQuery,
    isValidObjectId,
} from "../utils/tenantContext.js";


// =====================================================
// HELPERS
// =====================================================

const parseNumber = (value, field) => {
    if (value === undefined || value === null || value === "") {
        return undefined;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        const error = new Error(
            `${field} must be a valid number.`
        );

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


const normalizeText = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value)
        .trim()
        .replace(/\s+/g, " ");

    return text || null;
};


// =====================================================
// POPULATE INVENTORY
// =====================================================

const populateInventory = (query) => {
    return query
        .populate({
            path: "tenantOwner",
            select: "name email",
        })
        .populate({
            path: "product",
            select:
                "name sku slug barcode brand model category business businessType hasVariants trackSerial",
            populate: [
                {
                    path: "brand",
                    select: "name",
                },
                {
                    path: "model",
                    select: "name",
                },
                {
                    path: "category",
                    select: "name",
                },
            ],
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


// =====================================================
// GET PRODUCT FOR CURRENT TENANT
// =====================================================

const getProductForUser = async (req, productId) => {
    if (!isValidObjectId(productId)) {
        return null;
    }

    const tenant = await getTenantContext(req);

    const query = {
        _id: productId,
    };

    if (!tenant.isSuperAdmin) {
        Object.assign(
            query,
            buildProductInventoryQuery(tenant)
        );
    }

    return Product.findOne(query).lean();
};


// =====================================================
// GET INVENTORY FOR CURRENT TENANT
// =====================================================

const getInventoryForUser = async (
    req,
    inventoryId,
    isActive = true
) => {
    if (!isValidObjectId(inventoryId)) {
        return null;
    }

    const tenant = await getTenantContext(req);

    const query = {
        _id: inventoryId,
        isActive,
    };

    if (!tenant.isSuperAdmin) {
        Object.assign(
            query,
            buildProductInventoryQuery(tenant)
        );
    }

    return ProductInventory.findOne(query);
};


// =====================================================
// CREATE PRODUCT INVENTORY
// =====================================================

export const createProductInventory = async (
    req,
    res,
    next
) => {
    try {
        const {
            product,
            color,
            size,
            quantity = 0,
            minStock = 0,
            maxStock = null,
            purchasePrice = 0,
            salePrice = 0,
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

        const productData =
            await getProductForUser(
                req,
                product
            );

        if (!productData) {
            return errorResponse(
                res,
                404,
                "Product not found or you do not have access to it."
            );
        }

        const parsedQuantity =
            parseNumber(quantity, "Quantity") ?? 0;

        const parsedMinStock =
            parseNumber(minStock, "Minimum stock") ?? 0;

        const parsedMaxStock =
            parseNumber(maxStock, "Maximum stock");

        const parsedPurchasePrice =
            parseNumber(
                purchasePrice,
                "Purchase price"
            ) ?? 0;

        const parsedSalePrice =
            parseNumber(
                salePrice,
                "Sale price"
            ) ?? 0;

        const parsedDiscount =
            parseNumber(
                discount,
                "Discount"
            ) ?? 0;

        const parsedTax =
            parseNumber(
                tax,
                "Tax"
            ) ?? 0;

        // -------------------------------------------------
        // BASIC VALIDATION
        // -------------------------------------------------

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

        // -------------------------------------------------
        // VARIANT VALIDATION
        // -------------------------------------------------

        const normalizedColor =
            normalizeText(color);

        const normalizedSize =
            normalizeText(size);

        if (
            !productData.hasVariants &&
            (normalizedColor || normalizedSize)
        ) {
            return errorResponse(
                res,
                400,
                "This product does not support color or size variants."
            );
        }

        // -------------------------------------------------
        // TENANT DATA COMES FROM PRODUCT
        // -------------------------------------------------

        if (
            !productData.tenantOwner ||
            !productData.business ||
            !productData.businessType
        ) {
            return errorResponse(
                res,
                400,
                "Product is missing tenant, business, or business type."
            );
        }

        // -------------------------------------------------
        // DUPLICATE ACTIVE VARIANT
        // -------------------------------------------------

        const duplicate =
            await ProductInventory.findOne({
                tenantOwner:
                    productData.tenantOwner,

                product:
                    productData._id,

                color:
                    normalizedColor,

                size:
                    normalizedSize,

                isActive: true,
            });

        if (duplicate) {
            return errorResponse(
                res,
                409,
                "This product inventory variant already exists in this tenant."
            );
        }

        // -------------------------------------------------
        // CREATE
        // -------------------------------------------------

        const inventory =
            await ProductInventory.create({
                tenantOwner:
                    productData.tenantOwner,

                business:
                    productData.business,

                businessType:
                    productData.businessType,

                product:
                    productData._id,

                color:
                    normalizedColor,

                size:
                    normalizedSize,

                quantity:
                    parsedQuantity,

                minStock:
                    parsedMinStock,

                maxStock:
                    parsedMaxStock ?? null,

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

        const result =
            await populateInventory(
                ProductInventory.findById(
                    inventory._id
                )
            ).lean();

        return successResponse(
            res,
            201,
            "Product inventory created successfully.",
            result
        );

    } catch (error) {
        console.error(
            "Create Product Inventory Error:",
            error
        );

        if (error.code === 11000) {
            return errorResponse(
                res,
                409,
                "This product inventory variant already exists in this tenant."
            );
        }

        next(error);
    }
};


// =====================================================
// GET ALL PRODUCT INVENTORY
// =====================================================

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
            Math.max(
                Number(req.query.limit) || 20,
                1
            ),
            100
        );

        const tenant =
            await getTenantContext(req);

        const query = {
            isActive: true,
        };

        // -------------------------------------------------
        // TENANT ISOLATION
        // -------------------------------------------------

        Object.assign(
            query,
            buildProductInventoryQuery(
                tenant
            )
        );

        // -------------------------------------------------
        // SUPER ADMIN FILTERS
        // -------------------------------------------------

        if (
            tenant.isSuperAdmin &&
            business
        ) {
            if (!isValidObjectId(business)) {
                return errorResponse(
                    res,
                    400,
                    "Invalid business ID."
                );
            }

            query.business = business;
        }

        if (
            tenant.isSuperAdmin &&
            businessType
        ) {
            if (!isValidObjectId(businessType)) {
                return errorResponse(
                    res,
                    400,
                    "Invalid business type ID."
                );
            }

            query.businessType =
                businessType;
        }

        // -------------------------------------------------
        // PRODUCT FILTER
        // -------------------------------------------------

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
            };

            if (query.tenantOwner) {
                productQuery.tenantOwner =
                    query.tenantOwner;
            }

            if (query.business) {
                productQuery.business =
                    query.business;
            }

            if (query.businessType) {
                productQuery.businessType =
                    query.businessType;
            }

            const productExists =
                await Product.exists(
                    productQuery
                );

            if (!productExists) {
                return errorResponse(
                    res,
                    404,
                    "Product not found or you do not have access to it."
                );
            }

            query.product = product;
        }

        // -------------------------------------------------
        // SEARCH
        // -------------------------------------------------

        if (search?.trim()) {
            const escaped =
                String(search)
                    .trim()
                    .replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    );

            const regex =
                new RegExp(
                    escaped,
                    "i"
                );

            const productQuery = {
                $or: [
                    { name: regex },
                    { sku: regex },
                    { barcode: regex },
                ],
            };

            if (query.tenantOwner) {
                productQuery.tenantOwner =
                    query.tenantOwner;
            }

            if (query.business) {
                productQuery.business =
                    query.business;
            }

            if (query.businessType) {
                productQuery.businessType =
                    query.businessType;
            }

            const productIds =
                await Product.distinct(
                    "_id",
                    productQuery
                );

            query.$or = [
                {
                    product: {
                        $in: productIds,
                    },
                },
                {
                    color: regex,
                },
                {
                    size: regex,
                },
            ];
        }

        // -------------------------------------------------
        // VARIANT FILTERS
        // -------------------------------------------------

        if (color) {
            query.color =
                String(color).trim();
        }

        if (size) {
            query.size =
                String(size).trim();
        }

        // -------------------------------------------------
        // STOCK STATUS
        // -------------------------------------------------

        if (
            stockStatus &&
            ![
                "out-of-stock",
                "in-stock",
                "low-stock",
            ].includes(stockStatus)
        ) {
            return errorResponse(
                res,
                400,
                "Invalid stock status."
            );
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
                $lte: [
                    "$quantity",
                    "$minStock",
                ],
            };
        }

        // -------------------------------------------------
        // FETCH
        // -------------------------------------------------

        const total =
            await ProductInventory.countDocuments(
                query
            );

        const inventory =
            await populateInventory(
                ProductInventory.find(query)
                    .sort({
                        createdAt: -1,
                    })
                    .skip(
                        (page - 1) * limit
                    )
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
                    totalPages:
                        Math.ceil(
                            total / limit
                        ),
                },
            }
        );

    } catch (error) {
        console.error(
            "Get Product Inventory Error:",
            error
        );

        next(error);
    }
};


// =====================================================
// GET INVENTORY BY PRODUCT
// =====================================================

export const getProductInventory = async (
    req,
    res,
    next
) => {
    try {
        const { productId } =
            req.params;

        if (!isValidObjectId(productId)) {
            return errorResponse(
                res,
                400,
                "Invalid product ID."
            );
        }

        const product =
            await getProductForUser(
                req,
                productId
            );

        if (!product) {
            return errorResponse(
                res,
                404,
                "Product not found or you do not have access to it."
            );
        }

        const inventory =
            await populateInventory(
                ProductInventory.find({
                    tenantOwner:
                        product.tenantOwner,

                    business:
                        product.business,

                    businessType:
                        product.businessType,

                    product:
                        product._id,

                    isActive: true,
                }).sort({
                    createdAt: -1,
                })
            ).lean();

        return successResponse(
            res,
            200,
            "Product inventory fetched successfully.",
            inventory
        );

    } catch (error) {
        console.error(
            "Get Product Inventory Error:",
            error
        );

        next(error);
    }
};


// =====================================================
// GET INVENTORY BY ID
// =====================================================

export const getProductInventoryById = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        if (!isValidObjectId(id)) {
            return errorResponse(
                res,
                400,
                "Invalid inventory ID."
            );
        }

        const inventory =
            await getInventoryForUser(
                req,
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

        const result =
            await populateInventory(
                ProductInventory.findById(
                    inventory._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Product inventory fetched successfully.",
            result
        );

    } catch (error) {
        console.error(
            "Get Product Inventory By ID Error:",
            error
        );

        next(error);
    }
};


// =====================================================
// UPDATE INVENTORY
// =====================================================

export const updateProductInventory = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        if (!isValidObjectId(id)) {
            return errorResponse(
                res,
                400,
                "Invalid inventory ID."
            );
        }

        const inventory =
            await getInventoryForUser(
                req,
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

        // -------------------------------------------------
        // VARIANT
        // -------------------------------------------------

        if (
            req.body.color !== undefined ||
            req.body.size !== undefined
        ) {
            const color =
                req.body.color !== undefined
                    ? normalizeText(
                          req.body.color
                      )
                    : inventory.color;

            const size =
                req.body.size !== undefined
                    ? normalizeText(
                          req.body.size
                      )
                    : inventory.size;

            const product =
                await Product.findById(
                    inventory.product
                )
                    .select(
                        "hasVariants"
                    )
                    .lean();

            if (
                !product?.hasVariants &&
                (color || size)
            ) {
                return errorResponse(
                    res,
                    400,
                    "This product does not support color or size variants."
                );
            }

            const duplicate =
                await ProductInventory.findOne({
                    _id: {
                        $ne: inventory._id,
                    },

                    tenantOwner:
                        inventory.tenantOwner,

                    product:
                        inventory.product,

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

            inventory.color =
                color;

            inventory.size =
                size;
        }

        // -------------------------------------------------
        // NUMERIC FIELDS
        // -------------------------------------------------

        if (
            req.body.quantity !==
            undefined
        ) {
            const value =
                parseNumber(
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

            inventory.quantity =
                value;
        }

        if (
            req.body.minStock !==
            undefined
        ) {
            const value =
                parseNumber(
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

            inventory.minStock =
                value;
        }

        if (
            req.body.maxStock !==
            undefined
        ) {
            const value =
                parseNumber(
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

            inventory.maxStock =
                value ?? null;
        }

        if (
            inventory.maxStock !== null &&
            inventory.maxStock <
                inventory.minStock
        ) {
            return errorResponse(
                res,
                400,
                "Maximum stock cannot be less than minimum stock."
            );
        }

        if (
            req.body.purchasePrice !==
            undefined
        ) {
            const value =
                parseNumber(
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

            inventory.purchasePrice =
                value;
        }

        if (
            req.body.salePrice !==
            undefined
        ) {
            const value =
                parseNumber(
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

            inventory.salePrice =
                value;
        }

        if (
            req.body.discount !==
            undefined
        ) {
            const value =
                parseNumber(
                    req.body.discount,
                    "Discount"
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

            inventory.discount =
                value;
        }

        if (
            req.body.tax !==
            undefined
        ) {
            const value =
                parseNumber(
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

            inventory.tax =
                value;
        }

        // -------------------------------------------------
        // ACTIVE STATUS
        // -------------------------------------------------

        if (
            req.body.isActive !==
            undefined
        ) {
            const value =
                parseBoolean(
                    req.body.isActive
                );

            if (value === undefined) {
                return errorResponse(
                    res,
                    400,
                    "Invalid isActive value."
                );
            }

            inventory.isActive =
                value;
        }

        inventory.updatedBy =
            req.user._id;

        await inventory.save();

        const updated =
            await populateInventory(
                ProductInventory.findById(
                    inventory._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Product inventory updated successfully.",
            updated
        );

    } catch (error) {
        console.error(
            "Update Product Inventory Error:",
            error
        );

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


// =====================================================
// UPDATE STOCK
// =====================================================

export const updateProductStock = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

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

        const amount =
            parseNumber(
                quantity,
                "Quantity"
            );

        if (
            amount === undefined ||
            amount < 0
        ) {
            return errorResponse(
                res,
                400,
                "Quantity must be a valid non-negative number."
            );
        }

        if (
            ![
                "add",
                "subtract",
                "set",
            ].includes(operation)
        ) {
            return errorResponse(
                res,
                400,
                "Operation must be add, subtract, or set."
            );
        }

        const inventory =
            await getInventoryForUser(
                req,
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
            inventory.quantity += amount;
        }

        if (operation === "subtract") {
            if (
                amount >
                inventory.quantity
            ) {
                return errorResponse(
                    res,
                    400,
                    "Insufficient stock."
                );
            }

            inventory.quantity -=
                amount;
        }

        if (operation === "set") {
            inventory.quantity =
                amount;
        }

        inventory.updatedBy =
            req.user._id;

        await inventory.save();

        const updated =
            await populateInventory(
                ProductInventory.findById(
                    inventory._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Product stock updated successfully.",
            updated
        );

    } catch (error) {
        console.error(
            "Update Product Stock Error:",
            error
        );

        next(error);
    }
};


// =====================================================
// DELETE INVENTORY
// =====================================================

export const deleteProductInventory = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        if (!isValidObjectId(id)) {
            return errorResponse(
                res,
                400,
                "Invalid inventory ID."
            );
        }

        const inventory =
            await getInventoryForUser(
                req,
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

        inventory.isActive =
            false;

        inventory.updatedBy =
            req.user._id;

        await inventory.save();

        return successResponse(
            res,
            200,
            "Product inventory deleted successfully."
        );

    } catch (error) {
        console.error(
            "Delete Product Inventory Error:",
            error
        );

        next(error);
    }
};


// =====================================================
// RESTORE INVENTORY
// =====================================================

export const restoreProductInventory = async (
    req,
    res,
    next
) => {
    try {
        const { id } =
            req.params;

        if (!isValidObjectId(id)) {
            return errorResponse(
                res,
                400,
                "Invalid inventory ID."
            );
        }

        const inventory =
            await getInventoryForUser(
                req,
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

        const duplicate =
            await ProductInventory.findOne({
                _id: {
                    $ne: inventory._id,
                },

                tenantOwner:
                    inventory.tenantOwner,

                product:
                    inventory.product,

                color:
                    inventory.color,

                size:
                    inventory.size,

                isActive: true,
            });

        if (duplicate) {
            return errorResponse(
                res,
                409,
                "An active inventory variant with the same color and size already exists."
            );
        }

        inventory.isActive =
            true;

        inventory.updatedBy =
            req.user._id;

        await inventory.save();

        const restored =
            await populateInventory(
                ProductInventory.findById(
                    inventory._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Product inventory restored successfully.",
            restored
        );

    } catch (error) {
        console.error(
            "Restore Product Inventory Error:",
            error
        );

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
