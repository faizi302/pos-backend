import SaleItem from "../models/SaleItem.js";
import Sale from "../models/Sale.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";

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
      req.body.tenantOwner ||
      req.query.tenantOwner;

    const business =
      req.body.business ||
      req.query.business;

    const businessType =
      req.body.businessType ||
      req.query.businessType;

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
      query: {
        tenantOwner,
        business,
        businessType,
      },
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
  discount = 0,
  tax = 0,
}) => {
  const lineSubtotal = quantity * salePrice;
  const discountAmount = Math.min(
    discount,
    lineSubtotal
  );

  const lineTotal =
    lineSubtotal -
    discountAmount +
    tax;

  return {
    lineSubtotal,
    lineTotal,
  };
};

const recalculateSale = async (
  sale,
  scope,
  userId
) => {
  const items = await SaleItem.find({
    sale: sale._id,
    ...scope,
  });

  const subtotal = items.reduce(
    (sum, item) => sum + item.lineSubtotal,
    0
  );

  const discount = items.reduce(
    (sum, item) => sum + item.discount,
    0
  );

  const tax = items.reduce(
    (sum, item) => sum + item.tax,
    0
  );

  sale.subtotal = subtotal;
  sale.discount = discount;
  sale.tax = tax;

  sale.totalAmount =
    subtotal -
    discount +
    tax +
    (sale.shippingCost || 0) +
    (sale.otherCharges || 0);

  sale.paidAmount = Math.min(
    sale.paidAmount || 0,
    sale.totalAmount
  );

  sale.dueAmount =
    sale.totalAmount -
    sale.paidAmount;

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
    .populate(
      "businessType",
      "name"
    )
    .populate(
      "sale",
      "saleNumber saleDate status totalAmount"
    )
    .populate(
      "product",
      "name sku barcode"
    )
    .populate(
      "productInventory",
      "color size quantity salePrice"
    )
    .populate(
      "createdBy",
      "name email"
    )
    .populate(
      "updatedBy",
      "name email"
    );

// =====================================================
// CREATE
// =====================================================

export const createSaleItem = async (
  req,
  res,
  next
) => {
  try {
    const scopeData = await getScope(req);

    if (!scopeData) {
      return errorResponse(
        res,
        400,
        "tenantOwner, business and businessType are required."
      );
    }

    const { tenant, query: scope } = scopeData;

    const {
      sale,
      product,
      productInventory,
      quantity,
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
      return errorResponse(
        res,
        400,
        "Valid quantity is required."
      );
    }

    const saleDoc = await Sale.findOne({
      _id: sale,
      ...scope,
    });

    if (!saleDoc) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    if (
      [
        "completed",
        "partially_returned",
        "returned",
        "cancelled",
      ].includes(saleDoc.status)
    ) {
      return errorResponse(
        res,
        400,
        "Sale cannot accept new items."
      );
    }

    const productDoc = await Product.findOne({
      _id: product,
      ...scope,
      isActive: true,
    });

    if (!productDoc) {
      return errorResponse(
        res,
        404,
        "Product not found."
      );
    }

    const inventory =
      await ProductInventory.findOne({
        _id: productInventory,
        ...scope,
        product,
        isActive: true,
      });

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Product inventory variant not found."
      );
    }

    if (quantity > inventory.quantity) {
      return errorResponse(
        res,
        400,
        `Insufficient stock. Available quantity is ${inventory.quantity}.`
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

    const salePrice =
      req.body.salePrice ??
      inventory.salePrice ??
      0;

    const discount =
      req.body.discount ??
      inventory.discount ??
      0;

    const tax =
      req.body.tax ??
      inventory.tax ??
      0;

    const {
      lineSubtotal,
      lineTotal,
    } = calculateLine({
      quantity,
      salePrice,
      discount,
      tax,
    });

    const saleItem = await SaleItem.create({
      ...scope,
      sale,
      product,
      productInventory,
      quantity,
      salePrice,
      discount,
      tax,
      lineSubtotal,
      lineTotal,
      createdBy: req.user._id,
    });

    await recalculateSale(
      saleDoc,
      scope,
      req.user._id
    );

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
// GET ALL
// =====================================================

export const getAllSaleItems = async (
  req,
  res,
  next
) => {
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
    } = req.query;

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const currentLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const filter = {
      ...scope,
    };

    if (sale) {
      if (!isValidObjectId(sale)) {
        return errorResponse(
          res,
          400,
          "Invalid sale ID."
        );
      }

      filter.sale = sale;
    }

    if (product) {
      if (!isValidObjectId(product)) {
        return errorResponse(
          res,
          400,
          "Invalid product ID."
        );
      }

      filter.product = product;
    }

    if (productInventory) {
      if (!isValidObjectId(productInventory)) {
        return errorResponse(
          res,
          400,
          "Invalid product inventory ID."
        );
      }

      filter.productInventory =
        productInventory;
    }

    const skip =
      (currentPage - 1) *
      currentLimit;

    const [items, total] =
      await Promise.all([
        SaleItem.find(filter)
          .populate(
            "business",
            "name"
          )
          .populate(
            "businessType",
            "name"
          )
          .populate(
            "sale",
            "saleNumber saleDate status totalAmount"
          )
          .populate(
            "product",
            "name sku barcode"
          )
          .populate(
            "productInventory",
            "color size quantity salePrice"
          )
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(currentLimit),

        SaleItem.countDocuments(filter),
      ]);

    return successResponse(
      res,
      200,
      "Sale items fetched successfully.",
      {
        saleItems: items,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages: Math.ceil(
            total / currentLimit
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY SALE
// =====================================================

export const getSaleItemsBySale = async (
  req,
  res,
  next
) => {
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
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    const sale = await Sale.findOne({
      _id: saleId,
      ...scope,
    });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    const items = await SaleItem.find({
      sale: saleId,
      ...scope,
    })
      .populate(
        "product",
        "name sku barcode"
      )
      .populate(
        "productInventory",
        "color size quantity salePrice"
      )
      .sort({ createdAt: 1 });

    return successResponse(
      res,
      200,
      "Sale items fetched successfully.",
      items
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY ID
// =====================================================

export const getSaleItemById = async (
  req,
  res,
  next
) => {
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
      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const item = await SaleItem.findOne({
      _id: id,
      ...scope,
    })
      .populate(
        "tenantOwner",
        "name email"
      )
      .populate(
        "business",
        "name"
      )
      .populate(
        "businessType",
        "name"
      )
      .populate(
        "sale",
        "saleNumber saleDate status totalAmount"
      )
      .populate(
        "product",
        "name sku barcode"
      )
      .populate(
        "productInventory",
        "color size quantity salePrice"
      )
      .populate(
        "createdBy",
        "name email"
      )
      .populate(
        "updatedBy",
        "name email"
      );

    if (!item) {
      return errorResponse(
        res,
        404,
        "Sale item not found."
      );
    }

    return successResponse(
      res,
      200,
      "Sale item fetched successfully.",
      item
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE
// =====================================================

export const updateSaleItem = async (
  req,
  res,
  next
) => {
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
      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const saleItem =
      await SaleItem.findOne({
        _id: id,
        ...scope,
      });

    if (!saleItem) {
      return errorResponse(
        res,
        404,
        "Sale item not found."
      );
    }

    const sale = await Sale.findOne({
      _id: saleItem.sale,
      ...scope,
    });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Related sale not found."
      );
    }

    if (
      [
        "completed",
        "partially_returned",
        "returned",
        "cancelled",
      ].includes(sale.status)
    ) {
      return errorResponse(
        res,
        400,
        "Sale items cannot be edited after finalization."
      );
    }

    const product =
      req.body.product ||
      saleItem.product;

    const productInventory =
      req.body.productInventory ||
      saleItem.productInventory;

    const quantity =
      req.body.quantity ??
      saleItem.quantity;

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
      return errorResponse(
        res,
        404,
        "Product not found."
      );
    }

    const inventory =
      await ProductInventory.findOne({
        _id: productInventory,
        ...scope,
        product,
        isActive: true,
      });

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Product inventory variant not found."
      );
    }

    if (quantity > inventory.quantity) {
      return errorResponse(
        res,
        400,
        `Insufficient stock. Available quantity is ${inventory.quantity}.`
      );
    }

    const duplicate =
      await SaleItem.findOne({
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

    const salePrice =
      req.body.salePrice ??
      saleItem.salePrice ??
      inventory.salePrice ??
      0;

    const discount =
      req.body.discount ??
      saleItem.discount ??
      0;

    const tax =
      req.body.tax ??
      saleItem.tax ??
      0;

    const {
      lineSubtotal,
      lineTotal,
    } = calculateLine({
      quantity,
      salePrice,
      discount,
      tax,
    });

    saleItem.product = product;
    saleItem.productInventory =
      productInventory;
    saleItem.quantity = quantity;
    saleItem.salePrice = salePrice;
    saleItem.discount = discount;
    saleItem.tax = tax;
    saleItem.lineSubtotal =
      lineSubtotal;
    saleItem.lineTotal = lineTotal;
    saleItem.updatedBy = req.user._id;

    await saleItem.save();

    await recalculateSale(
      sale,
      scope,
      req.user._id
    );

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

export const deleteSaleItem = async (
  req,
  res,
  next
) => {
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
      return errorResponse(
        res,
        400,
        "Invalid sale item ID."
      );
    }

    const saleItem =
      await SaleItem.findOne({
        _id: id,
        ...scope,
      });

    if (!saleItem) {
      return errorResponse(
        res,
        404,
        "Sale item not found."
      );
    }

    const sale = await Sale.findOne({
      _id: saleItem.sale,
      ...scope,
    });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Related sale not found."
      );
    }

    if (
      [
        "completed",
        "partially_returned",
        "returned",
        "cancelled",
      ].includes(sale.status)
    ) {
      return errorResponse(
        res,
        400,
        "Sale items cannot be deleted after finalization."
      );
    }

    await SaleItem.deleteOne({
      _id: id,
      ...scope,
    });

    await recalculateSale(
      sale,
      scope,
      req.user._id
    );

    return successResponse(
      res,
      200,
      "Sale item deleted successfully.",
      null
    );
  } catch (error) {
    next(error);
  }
};