import SaleItem from "../models/SaleItem.js";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import InventoryUnit from "../models/InventoryUnit.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

import {
  getTenantContext,
  buildTenantBusinessQuery,
  isValidObjectId,
} from "../utils/tenantContext.js";

// =====================================================
// HELPERS
// =====================================================

const getScope = async (req) => {
  const tenant = await getTenantContext(req);

  if (tenant.isSuperAdmin) {
    const tenantOwner =
      req.body.tenantOwner || req.query.tenantOwner;
    const business =
      req.body.business || req.query.business;
    const businessType =
      req.body.businessType || req.query.businessType;

    if (
      !tenantOwner ||
      !business ||
      !businessType ||
      !isValidObjectId(tenantOwner) ||
      !isValidObjectId(business) ||
      !isValidObjectId(businessType)
    ) {
      return null;
    }

    return {
      tenant,
      query: { tenantOwner, business, businessType },
    };
  }

  return {
    tenant,
    query: buildTenantBusinessQuery(tenant),
  };
};

const calculateLine = ({
  quantity,
  salePrice,
  discountPercent = 0,
  tax = 0,
}) => {
  const qty = Number(quantity) || 0;
  const price = Number(salePrice) || 0;
  const percent = Number(discountPercent) || 0;
  const taxAmount = Number(tax) || 0;

  const lineSubtotal = qty * price;
  const discountAmount = Math.min(
    (lineSubtotal * percent) / 100,
    lineSubtotal
  );

  const lineTotal = lineSubtotal - discountAmount + taxAmount;

  return {
    lineSubtotal: Number(lineSubtotal.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    lineTotal: Number(lineTotal.toFixed(2)),
  };
};

const recalculateSale = async (sale, scope, userId) => {
  const items = await SaleItem.find({
    sale: sale._id,
    ...scope,
  });

  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.lineSubtotal || 0),
    0
  );
  const discount = items.reduce(
    (sum, item) => sum + Number(item.discount || 0),
    0
  );
  const tax = items.reduce(
    (sum, item) => sum + Number(item.tax || 0),
    0
  );

  sale.subtotal = Number(subtotal.toFixed(2));
  sale.discount = Number(discount.toFixed(2));
  sale.tax = Number(tax.toFixed(2));

  sale.totalAmount = Number(
    (
      subtotal -
      discount +
      tax +
      (sale.shippingCost || 0) +
      (sale.otherCharges || 0)
    ).toFixed(2)
  );

  sale.paidAmount = Math.min(
    Number(sale.paidAmount || 0),
    sale.totalAmount
  );

  sale.dueAmount = Number(
    (sale.totalAmount - sale.paidAmount).toFixed(2)
  );

  sale.paymentStatus =
    sale.dueAmount <= 0
      ? "paid"
      : sale.paidAmount > 0
        ? "partially_paid"
        : "unpaid";

  sale.updatedBy = userId;
  await sale.save();
};

const getPopulatedItem = (id) =>
  SaleItem.findById(id)
    .populate("tenantOwner", "name email")
    .populate("business", "name")
    .populate("businessType", "name")
    .populate("sale", "saleNumber saleDate status totalAmount")
    .populate("product", "name sku barcode")
    .populate(
      "productInventory",
      "color size quantity salePrice discount tax"
    )
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

const adjustInventoryQuantity = async (
  inventoryId,
  delta,
  userId,
  scope
) => {
  return ProductInventory.findOneAndUpdate(
    {
      _id: inventoryId,
      ...scope,
      isActive: true,
      ...(delta < 0 ? { quantity: { $gte: Math.abs(delta) } } : {}),
    },
    {
      $inc: { quantity: delta },
      $set: { updatedBy: userId },
    },
    { new: true }
  );
};

/**
 * Deactivate InventoryUnit after successful sale
 * Supports both inventoryUnit ID and IMEI string
 */
const deactivateInventoryUnit = async ({
  inventoryUnitId,
  imei,
  scope,
  userId,
}) => {
  // 1. Prefer exact ID (most reliable)
  if (inventoryUnitId && isValidObjectId(inventoryUnitId)) {
    const updated = await InventoryUnit.findOneAndUpdate(
      {
        _id: inventoryUnitId,
        ...scope,
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          updatedBy: userId,
        },
      },
      { new: true }
    );

    if (updated) {
      console.log(`✅ InventoryUnit deactivated by ID: ${inventoryUnitId}`);
      return true;
    }
  }

  // 2. Fallback to IMEI
  if (imei) {
    const normalizedImei = String(imei).trim().toUpperCase();

    const updated = await InventoryUnit.findOneAndUpdate(
      {
        imei: normalizedImei,
        tenantOwner: scope.tenantOwner, // only tenantOwner is enough for uniqueness
        isActive: true,
      },
      {
        $set: {
          isActive: false,
          updatedBy: userId,
        },
      },
      { new: true }
    );

    if (updated) {
      console.log(`✅ InventoryUnit deactivated by IMEI: ${normalizedImei}`);
      return true;
    } else {
      console.warn(`⚠️ InventoryUnit NOT found for IMEI: ${normalizedImei}`);
    }
  }

  return false;
};

/**
 * Restore InventoryUnit when SaleItem is deleted
 */
const restoreInventoryUnit = async ({
  inventoryUnitId,
  imei,
  scope,
  userId,
}) => {
  if (inventoryUnitId && isValidObjectId(inventoryUnitId)) {
    await InventoryUnit.findOneAndUpdate(
      {
        _id: inventoryUnitId,
        ...scope,
        isActive: false,
      },
      {
        $set: {
          isActive: true,
          updatedBy: userId,
        },
      }
    );
    return;
  }

  if (imei) {
    const normalizedImei = String(imei).trim().toUpperCase();
    await InventoryUnit.findOneAndUpdate(
      {
        imei: normalizedImei,
        tenantOwner: scope.tenantOwner,
        isActive: false,
      },
      {
        $set: {
          isActive: true,
          updatedBy: userId,
        },
      }
    );
  }
};

// =====================================================
// CREATE
// =====================================================

export const createSaleItem = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);

    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { query: scope } = scopeData;

    const {
      sale,
      product,
      productInventory,
      quantity,
      inventoryUnit, // ← important
      imei,
    } = req.body;

    if (
      !isValidObjectId(sale) ||
      !isValidObjectId(product) ||
      !isValidObjectId(productInventory)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale, product or inventory ID."
      );
    }

    if (!quantity || quantity <= 0) {
      return errorResponse(res, 400, "Valid quantity is required.");
    }

    const saleDoc = await Sale.findOne({ _id: sale, ...scope });
    if (!saleDoc) {
      return errorResponse(res, 404, "Sale not found.");
    }

    if (
      ["completed", "partially_returned", "returned", "cancelled"].includes(
        saleDoc.status
      )
    ) {
      return errorResponse(res, 400, "Sale cannot accept new items.");
    }

    const productDoc = await Product.findOne({
      _id: product,
      ...scope,
      isActive: true,
    });
    if (!productDoc) {
      return errorResponse(res, 404, "Product not found.");
    }

    const inventory = await ProductInventory.findOne({
      _id: productInventory,
      ...scope,
      product,
      isActive: true,
    });
    if (!inventory) {
      return errorResponse(res, 404, "Product inventory variant not found.");
    }

    if (quantity > inventory.quantity) {
      return errorResponse(
        res,
        400,
        `Insufficient stock. Available quantity is ${inventory.quantity}.`
      );
    }

    if (productDoc.trackSerial && quantity > 1) {
      return errorResponse(
        res,
        400,
        "This is a serial (IMEI) item. Quantity must be 1."
      );
    }

    const exists = await SaleItem.findOne({
      sale,
      productInventory,
      ...scope,
    });
    if (exists) {
      return errorResponse(
        res,
        409,
        "This inventory variant already exists in the sale."
      );
    }

    // ========== PRICE FROM INVENTORY ==========
    const salePrice = Number(inventory.salePrice) || 0;
    const discountPercent = Number(inventory.discount) || 0;
    const tax = Number(req.body.tax ?? inventory.tax ?? 0);

    const { lineSubtotal, discountAmount, lineTotal } = calculateLine({
      quantity,
      salePrice,
      discountPercent,
      tax,
    });

    // ---------- DEDUCT STOCK ----------
    const updatedInventory = await adjustInventoryQuantity(
      inventory._id,
      -quantity,
      req.user._id,
      scope
    );

    if (!updatedInventory) {
      return errorResponse(
        res,
        400,
        "Insufficient stock (concurrent update detected)."
      );
    }

    const finalImei = imei?.toString().trim().toUpperCase() || null;

    const saleItem = await SaleItem.create({
      ...scope,
      sale,
      product,
      productInventory,
      quantity,
      salePrice,
      discount: discountAmount,
      tax,
      lineSubtotal,
      lineTotal,
      imei: finalImei,
      createdBy: req.user._id,
    });

    // ========== DEACTIVATE IMEI / UNIT ==========
    await deactivateInventoryUnit({
      inventoryUnitId: inventoryUnit,
      imei: finalImei,
      scope,
      userId: req.user._id,
    });

    await recalculateSale(saleDoc, scope, req.user._id);

    return successResponse(
      res,
      201,
      "Sale item created successfully.",
      await getPopulatedItem(saleItem._id)
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET ALL / GET BY SALE / GET BY ID  (unchanged)
// =====================================================

export const getAllSaleItems = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { query: scope } = scopeData;
    const {
      page = 1,
      limit = 20,
      sale,
      product,
      productInventory,
      imei,
    } = req.query;

    const currentPage = Math.max(Number(page) || 1, 1);
    const currentLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);

    const filter = { ...scope };

    if (sale) {
      if (!isValidObjectId(sale))
        return errorResponse(res, 400, "Invalid sale ID.");
      filter.sale = sale;
    }
    if (product) {
      if (!isValidObjectId(product))
        return errorResponse(res, 400, "Invalid product ID.");
      filter.product = product;
    }
    if (productInventory) {
      if (!isValidObjectId(productInventory))
        return errorResponse(res, 400, "Invalid product inventory ID.");
      filter.productInventory = productInventory;
    }
    if (imei) filter.imei = String(imei).trim().toUpperCase();

    const skip = (currentPage - 1) * currentLimit;

    const [items, total] = await Promise.all([
      SaleItem.find(filter)
        .populate("business", "name")
        .populate("businessType", "name")
        .populate("sale", "saleNumber saleDate status totalAmount")
        .populate("product", "name sku barcode")
        .populate(
          "productInventory",
          "color size quantity salePrice discount tax"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(currentLimit),
      SaleItem.countDocuments(filter),
    ]);

    return successResponse(res, 200, "Sale items fetched successfully.", {
      saleItems: items,
      pagination: {
        total,
        page: currentPage,
        limit: currentLimit,
        totalPages: Math.ceil(total / currentLimit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSaleItemsBySale = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { query: scope } = scopeData;
    const { saleId } = req.params;

    if (!isValidObjectId(saleId)) {
      return errorResponse(res, 400, "Invalid sale ID.");
    }

    const sale = await Sale.findOne({ _id: saleId, ...scope });
    if (!sale) return errorResponse(res, 404, "Sale not found.");

    const items = await SaleItem.find({ sale: saleId, ...scope })
      .populate("product", "name sku barcode")
      .populate(
        "productInventory",
        "color size quantity salePrice discount tax"
      )
      .sort({ createdAt: 1 });

    return successResponse(res, 200, "Sale items fetched successfully.", items);
  } catch (error) {
    next(error);
  }
};

export const getSaleItemById = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { query: scope } = scopeData;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid sale item ID.");
    }

    const item = await SaleItem.findOne({ _id: id, ...scope })
      .populate("tenantOwner", "name email")
      .populate("business", "name")
      .populate("businessType", "name")
      .populate("sale", "saleNumber saleDate status totalAmount")
      .populate("product", "name sku barcode")
      .populate(
        "productInventory",
        "color size quantity salePrice discount tax"
      )
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email");

    if (!item) {
      return errorResponse(res, 404, "Sale item not found.");
    }

    return successResponse(res, 200, "Sale item fetched successfully.", item);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE
// =====================================================

export const updateSaleItem = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { query: scope } = scopeData;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid sale item ID.");
    }

    const saleItem = await SaleItem.findOne({ _id: id, ...scope });
    if (!saleItem) {
      return errorResponse(res, 404, "Sale item not found.");
    }

    const sale = await Sale.findOne({ _id: saleItem.sale, ...scope });
    if (!sale) {
      return errorResponse(res, 404, "Related sale not found.");
    }

    if (
      ["completed", "partially_returned", "returned", "cancelled"].includes(
        sale.status
      )
    ) {
      return errorResponse(
        res,
        400,
        "Sale items cannot be edited after finalization."
      );
    }

    const product = req.body.product || saleItem.product;
    const productInventory =
      req.body.productInventory || saleItem.productInventory;
    const quantity = req.body.quantity ?? saleItem.quantity;

    if (
      !isValidObjectId(product) ||
      !isValidObjectId(productInventory) ||
      quantity <= 0
    ) {
      return errorResponse(
        res,
        400,
        "Invalid product, inventory or quantity."
      );
    }

    const productDoc = await Product.findOne({
      _id: product,
      ...scope,
      isActive: true,
    });
    if (!productDoc) {
      return errorResponse(res, 404, "Product not found.");
    }

    const inventory = await ProductInventory.findOne({
      _id: productInventory,
      ...scope,
      product,
      isActive: true,
    });
    if (!inventory) {
      return errorResponse(res, 404, "Product inventory variant not found.");
    }

    if (productDoc.trackSerial && quantity > 1) {
      return errorResponse(
        res,
        400,
        "This is a serial (IMEI) item. Quantity must be 1."
      );
    }

    const oldQty = saleItem.quantity;
    const diff = quantity - oldQty;

    if (diff > 0 && diff > inventory.quantity) {
      return errorResponse(
        res,
        400,
        `Insufficient stock. Available quantity is ${inventory.quantity}.`
      );
    }

    const duplicate = await SaleItem.findOne({
      sale: sale._id,
      productInventory,
      ...scope,
      _id: { $ne: id },
    });
    if (duplicate) {
      return errorResponse(
        res,
        409,
        "This inventory variant already exists in the sale."
      );
    }

    const salePrice = Number(inventory.salePrice) || 0;
    const discountPercent = Number(inventory.discount) || 0;
    const tax = Number(req.body.tax ?? saleItem.tax ?? inventory.tax ?? 0);

    const { lineSubtotal, discountAmount, lineTotal } = calculateLine({
      quantity,
      salePrice,
      discountPercent,
      tax,
    });

    if (diff !== 0) {
      const updatedInventory = await adjustInventoryQuantity(
        inventory._id,
        -diff,
        req.user._id,
        scope
      );
      if (!updatedInventory) {
        return errorResponse(
          res,
          400,
          "Insufficient stock (concurrent update detected)."
        );
      }
    }

    const oldImei = saleItem.imei;
    const newImei =
      req.body.imei?.toString().trim().toUpperCase() || oldImei;

    saleItem.product = product;
    saleItem.productInventory = productInventory;
    saleItem.quantity = quantity;
    saleItem.salePrice = salePrice;
    saleItem.discount = discountAmount;
    saleItem.tax = tax;
    saleItem.lineSubtotal = lineSubtotal;
    saleItem.lineTotal = lineTotal;
    saleItem.imei = newImei;
    saleItem.updatedBy = req.user._id;

    await saleItem.save();

    // Restore old IMEI + deactivate new one
    if (oldImei && oldImei !== newImei) {
      await restoreInventoryUnit({
        imei: oldImei,
        scope,
        userId: req.user._id,
      });
    }
    if (newImei) {
      await deactivateInventoryUnit({
        inventoryUnitId: req.body.inventoryUnit,
        imei: newImei,
        scope,
        userId: req.user._id,
      });
    }

    await recalculateSale(sale, scope, req.user._id);

    return successResponse(
      res,
      200,
      "Sale item updated successfully.",
      await getPopulatedItem(saleItem._id)
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// DELETE
// =====================================================

export const deleteSaleItem = async (req, res, next) => {
  try {
    const scopeData = await getScope(req);
    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { query: scope } = scopeData;
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid sale item ID.");
    }

    const saleItem = await SaleItem.findOne({ _id: id, ...scope });
    if (!saleItem) {
      return errorResponse(res, 404, "Sale item not found.");
    }

    const sale = await Sale.findOne({ _id: saleItem.sale, ...scope });
    if (!sale) {
      return errorResponse(res, 404, "Related sale not found.");
    }

    if (
      ["completed", "partially_returned", "returned", "cancelled"].includes(
        sale.status
      )
    ) {
      return errorResponse(
        res,
        400,
        "Sale items cannot be deleted after finalization."
      );
    }

    // Restore stock
    await adjustInventoryQuantity(
      saleItem.productInventory,
      +saleItem.quantity,
      req.user._id,
      scope
    );

    // Restore IMEI
    await restoreInventoryUnit({
      imei: saleItem.imei,
      scope,
      userId: req.user._id,
    });

    await SaleItem.deleteOne({ _id: id, ...scope });

    await recalculateSale(sale, scope, req.user._id);

    return successResponse(res, 200, "Sale item deleted successfully.", null);
  } catch (error) {
    next(error);
  }
};