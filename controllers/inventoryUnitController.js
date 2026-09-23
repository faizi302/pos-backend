import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import InventoryUnit from "../models/InventoryUnit.js";

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

const normalizeText = (value) => {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value)
        .trim()
        .replace(/\s+/g, " ");

    return text || null;
};

const parseBoolean = (value) => {
    if (value === true || value === "true") {
        return true;
    }

    if (value === false || value === "false") {
        return false;
    }

    return undefined;
};

const populateInventoryUnit = (query) => {
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
            path: "product",
            select:
                "name sku slug barcode brand model category productType unit trackSerial hasVariants",
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
            path: "productInventory",
            select:
                "color size quantity purchasePrice salePrice discount tax isActive",
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
// GET PRODUCT INVENTORY
// =====================================================

const getProductInventoryForUser = async (
    req,
    productInventoryId
) => {
    if (!isValidObjectId(productInventoryId)) {
        return null;
    }

    const tenant =
        await getTenantContext(req);

    const query = {
        _id: productInventoryId,
    };

    Object.assign(
        query,
        buildProductInventoryQuery(tenant)
    );

    return ProductInventory.findOne(query)
        .lean();
};

// =====================================================
// GET INVENTORY UNIT
// =====================================================

const getInventoryUnitForUser = async (
    req,
    inventoryUnitId,
    isActive = true
) => {
    if (!isValidObjectId(inventoryUnitId)) {
        return null;
    }

    const tenant =
        await getTenantContext(req);

    const query = {
        _id: inventoryUnitId,
        isActive,
    };

    if (!tenant.isSuperAdmin) {
        query.tenantOwner =
            tenant.tenantOwner;
    }

    return InventoryUnit.findOne(query);
};

// =====================================================
// CREATE INVENTORY UNIT
// =====================================================

export const createInventoryUnit = async (
    req,
    res,
    next
) => {
    try {
        const {
            product,
            productInventory,
            imei,
            serialNumber,
        } = req.body;

        if (
            !product ||
            !isValidObjectId(product)
        ) {
            return errorResponse(
                res,
                400,
                "Valid product ID is required."
            );
        }

        if (
            !productInventory ||
            !isValidObjectId(productInventory)
        ) {
            return errorResponse(
                res,
                400,
                "Valid product inventory ID is required."
            );
        }

        const normalizedImei =
            normalizeText(imei);

        if (!normalizedImei) {
            return errorResponse(
                res,
                400,
                "IMEI is required."
            );
        }

        const inventory =
            await getProductInventoryForUser(
                req,
                productInventory
            );

        if (!inventory) {
            return errorResponse(
                res,
                404,
                "Product inventory not found or you do not have access to it."
            );
        }

        if (
            String(inventory.product) !==
            String(product)
        ) {
            return errorResponse(
                res,
                400,
                "Product does not match the selected product inventory."
            );
        }

        const productData =
            await Product.findOne({
                _id: product,
                tenantOwner:
                    inventory.tenantOwner,
                business:
                    inventory.business,
                businessType:
                    inventory.businessType,
            })
                .select(
                    "name trackSerial"
                )
                .lean();

        if (!productData) {
            return errorResponse(
                res,
                404,
                "Product not found or does not belong to this inventory."
            );
        }

        if (!productData.trackSerial) {
            return errorResponse(
                res,
                400,
                "This product does not use serialized inventory units."
            );
        }

        const existing =
            await InventoryUnit.findOne({
                tenantOwner:
                    inventory.tenantOwner,
                imei: normalizedImei,
            });

        if (existing) {
            return errorResponse(
                res,
                409,
                "An inventory unit with this IMEI already exists in this tenant."
            );
        }

        const unit =
            await InventoryUnit.create({
                tenantOwner:
                    inventory.tenantOwner,

                business:
                    inventory.business,

                businessType:
                    inventory.businessType,

                product:
                    productData._id,

                productInventory:
                    inventory._id,

                imei:
                    normalizedImei,

                serialNumber:
                    normalizeText(
                        serialNumber
                    ),

                isActive: true,

                createdBy:
                    req.user._id,
            });

        const result =
            await populateInventoryUnit(
                InventoryUnit.findById(
                    unit._id
                )
            ).lean();

        return successResponse(
            res,
            201,
            "Inventory unit created successfully.",
            result
        );
    } catch (error) {
        console.error(
            "Create Inventory Unit Error:",
            error
        );

        if (error.code === 11000) {
            return errorResponse(
                res,
                409,
                "An inventory unit with this IMEI already exists in this tenant."
            );
        }

        next(error);
    }
};

// =====================================================
// GET ALL INVENTORY UNITS
// =====================================================

export const getAllInventoryUnits = async (
    req,
    res,
    next
) => {
    try {
        const {
            product,
            productInventory,
            business,
            businessType,
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

        if (!tenant.isSuperAdmin) {
            query.tenantOwner =
                tenant.tenantOwner;
            query.business =
                tenant.business;
            query.businessType =
                tenant.businessType;
        }

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

            const exists =
                await Product.exists(
                    productQuery
                );

            if (!exists) {
                return errorResponse(
                    res,
                    404,
                    "Product not found or you do not have access to it."
                );
            }

            query.product = product;
        }

        // -------------------------------------------------
        // PRODUCT INVENTORY FILTER
        // -------------------------------------------------

        if (productInventory) {
            if (
                !isValidObjectId(
                    productInventory
                )
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid product inventory ID."
                );
            }

            const inventory =
                await ProductInventory.exists({
                    _id:
                        productInventory,
                    ...(query.tenantOwner && {
                        tenantOwner:
                            query.tenantOwner,
                    }),
                    ...(query.business && {
                        business:
                            query.business,
                    }),
                    ...(query.businessType && {
                        businessType:
                            query.businessType,
                    }),
                });

            if (!inventory) {
                return errorResponse(
                    res,
                    404,
                    "Product inventory not found or you do not have access to it."
                );
            }

            query.productInventory =
                productInventory;
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

            query.$or = [
                {
                    imei: regex,
                },
                {
                    serialNumber: regex,
                },
            ];
        }

        // -------------------------------------------------
        // FETCH
        // -------------------------------------------------

        const total =
            await InventoryUnit.countDocuments(
                query
            );

        const units =
            await populateInventoryUnit(
                InventoryUnit.find(query)
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
            "Inventory units fetched successfully.",
            {
                units,
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
            "Get Inventory Units Error:",
            error
        );

        next(error);
    }
};

// =====================================================
// GET INVENTORY UNITS BY PRODUCT INVENTORY
// =====================================================

export const getInventoryUnitsByProductInventory =
    async (req, res, next) => {
        try {
            const {
                productInventoryId,
            } = req.params;

            if (
                !isValidObjectId(
                    productInventoryId
                )
            ) {
                return errorResponse(
                    res,
                    400,
                    "Invalid product inventory ID."
                );
            }

            const inventory =
                await getProductInventoryForUser(
                    req,
                    productInventoryId
                );

            if (!inventory) {
                return errorResponse(
                    res,
                    404,
                    "Product inventory not found or you do not have access to it."
                );
            }

            const units =
                await populateInventoryUnit(
                    InventoryUnit.find({
                        tenantOwner:
                            inventory.tenantOwner,
                        business:
                            inventory.business,
                        businessType:
                            inventory.businessType,
                        productInventory:
                            inventory._id,
                        isActive: true,
                    }).sort({
                        createdAt: -1,
                    })
                ).lean();

            return successResponse(
                res,
                200,
                "Inventory units fetched successfully.",
                units
            );
        } catch (error) {
            console.error(
                "Get Inventory Units By Product Inventory Error:",
                error
            );

            next(error);
        }
    };

// =====================================================
// GET INVENTORY UNIT BY ID
// =====================================================

export const getInventoryUnitById = async (
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
                "Invalid inventory unit ID."
            );
        }

        const unit =
            await getInventoryUnitForUser(
                req,
                id,
                true
            );

        if (!unit) {
            return errorResponse(
                res,
                404,
                "Inventory unit not found or you do not have access to it."
            );
        }

        const result =
            await populateInventoryUnit(
                InventoryUnit.findById(
                    unit._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Inventory unit fetched successfully.",
            result
        );
    } catch (error) {
        console.error(
            "Get Inventory Unit Error:",
            error
        );

        next(error);
    }
};

// =====================================================
// SCAN INVENTORY UNIT BY IMEI
// =====================================================

export const getInventoryUnitByImei = async (
    req,
    res,
    next
) => {
    try {
        const { imei } =
            req.params;

        const normalizedImei =
            normalizeText(imei);

        if (!normalizedImei) {
            return errorResponse(
                res,
                400,
                "IMEI is required."
            );
        }

        const tenant =
            await getTenantContext(req);

        const query = {
            imei: normalizedImei,
            isActive: true,
        };

        if (!tenant.isSuperAdmin) {
            query.tenantOwner =
                tenant.tenantOwner;
            query.business =
                tenant.business;
            query.businessType =
                tenant.businessType;
        }

        const unit =
            await populateInventoryUnit(
                InventoryUnit.findOne(
                    query
                )
            ).lean();

        if (!unit) {
            return errorResponse(
                res,
                404,
                "Inventory unit not found."
            );
        }

        return successResponse(
            res,
            200,
            "Inventory unit found successfully.",
            unit
        );
    } catch (error) {
        console.error(
            "Get Inventory Unit By IMEI Error:",
            error
        );

        next(error);
    }
};

// =====================================================
// UPDATE INVENTORY UNIT
// =====================================================

export const updateInventoryUnit = async (
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
                "Invalid inventory unit ID."
            );
        }

        const unit =
            await getInventoryUnitForUser(
                req,
                id,
                true
            );

        if (!unit) {
            return errorResponse(
                res,
                404,
                "Inventory unit not found or you do not have access to it."
            );
        }

        // IMEI is intentionally immutable.
        if (
            req.body.imei !== undefined
        ) {
            return errorResponse(
                res,
                400,
                "IMEI cannot be changed after the inventory unit is created."
            );
        }

        if (
            req.body.serialNumber !==
            undefined
        ) {
            unit.serialNumber =
                normalizeText(
                    req.body.serialNumber
                );
        }

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

            unit.isActive = value;
        }

        unit.updatedBy =
            req.user._id;

        await unit.save();

        const updated =
            await populateInventoryUnit(
                InventoryUnit.findById(
                    unit._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Inventory unit updated successfully.",
            updated
        );
    } catch (error) {
        console.error(
            "Update Inventory Unit Error:",
            error
        );

        next(error);
    }
};

// =====================================================
// DELETE INVENTORY UNIT
// =====================================================

export const deleteInventoryUnit = async (
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
                "Invalid inventory unit ID."
            );
        }

        const unit =
            await getInventoryUnitForUser(
                req,
                id,
                true
            );

        if (!unit) {
            return errorResponse(
                res,
                404,
                "Inventory unit not found or you do not have access to it."
            );
        }

        unit.isActive = false;
        unit.updatedBy =
            req.user._id;

        await unit.save();

        return successResponse(
            res,
            200,
            "Inventory unit deleted successfully."
        );
    } catch (error) {
        console.error(
            "Delete Inventory Unit Error:",
            error
        );

        next(error);
    }
};

// =====================================================
// RESTORE INVENTORY UNIT
// =====================================================

export const restoreInventoryUnit = async (
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
                "Invalid inventory unit ID."
            );
        }

        const unit =
            await getInventoryUnitForUser(
                req,
                id,
                false
            );

        if (!unit) {
            return errorResponse(
                res,
                404,
                "Deleted inventory unit not found or you do not have access to it."
            );
        }

        const duplicate =
            await InventoryUnit.findOne({
                _id: {
                    $ne: unit._id,
                },
                tenantOwner:
                    unit.tenantOwner,
                imei: unit.imei,
            });

        if (duplicate) {
            return errorResponse(
                res,
                409,
                "Another inventory unit with the same IMEI already exists."
            );
        }

        unit.isActive = true;
        unit.updatedBy =
            req.user._id;

        await unit.save();

        const restored =
            await populateInventoryUnit(
                InventoryUnit.findById(
                    unit._id
                )
            ).lean();

        return successResponse(
            res,
            200,
            "Inventory unit restored successfully.",
            restored
        );
    } catch (error) {
        console.error(
            "Restore Inventory Unit Error:",
            error
        );

        if (error.code === 11000) {
            return errorResponse(
                res,
                409,
                "Another inventory unit with the same IMEI already exists."
            );
        }

        next(error);
    }
};
