import mongoose from "mongoose";

import PurchaseItem from "../models/PurchaseItem.js";
import Purchase from "../models/Purchase.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import Business from "../models/Business.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";


/*
|--------------------------------------------------------------------------
| Helper Functions
|--------------------------------------------------------------------------
*/

const getUserRole = (req) => {
  return req.user?.role?.slug || "";
};

const isSuperAdmin = (req) => {
  return getUserRole(req) === "super-admin";
};

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


/*
|--------------------------------------------------------------------------
| Get Business ID
|--------------------------------------------------------------------------
|
| SuperAdmin:
|   Can provide business in body/query.
|
| Admin / Manager:
|   Business always comes from authenticated user.
|
*/

const getBusinessId = (req, allowBody = true) => {
  if (isSuperAdmin(req)) {
    if (allowBody && req.body?.business) {
      return req.body.business;
    }

    if (req.query?.business) {
      return req.query.business;
    }

    return null;
  }

  return req.user?.business?._id || req.user?.business || null;
};


/*
|--------------------------------------------------------------------------
| Validate Business
|--------------------------------------------------------------------------
*/

const validateBusiness = async (businessId) => {
  if (!businessId || !isValidObjectId(businessId)) {
    return null;
  }

  return Business.findOne({
    _id: businessId,
    isActive: true,
  });
};


/*
|--------------------------------------------------------------------------
| Create Purchase Item
|--------------------------------------------------------------------------
*/

export const createPurchaseItem = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found or inactive."
      );
    }

    const {
      purchase,
      product,
      productInventory,
      quantity,
      receivedQuantity = 0,
      purchasePrice,
      discount = 0,
      tax = 0,
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | Validate Purchase
    |--------------------------------------------------------------------------
    */

    if (!isValidObjectId(purchase)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }

    const purchaseRecord = await Purchase.findOne({
      _id: purchase,
      business: businessId,
    });

    if (!purchaseRecord) {
      return errorResponse(
        res,
        404,
        "Purchase not found for this business."
      );
    }

    if (purchaseRecord.status === "cancelled") {
      return errorResponse(
        res,
        400,
        "Cannot add items to a cancelled purchase."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Validate Product
    |--------------------------------------------------------------------------
    */

    if (!isValidObjectId(product)) {
      return errorResponse(
        res,
        400,
        "Invalid product ID."
      );
    }

    const productRecord = await Product.findOne({
      _id: product,
      business: businessId,
      isActive: true,
    });

    if (!productRecord) {
      return errorResponse(
        res,
        404,
        "Product not found for this business."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Validate Product Inventory
    |--------------------------------------------------------------------------
    */

    if (!isValidObjectId(productInventory)) {
      return errorResponse(
        res,
        400,
        "Invalid product inventory ID."
      );
    }

    const inventoryRecord = await ProductInventory.findOne({
      _id: productInventory,
      business: businessId,
      product: product,
      isActive: true,
    });

    if (!inventoryRecord) {
      return errorResponse(
        res,
        404,
        "Product inventory not found for this product and business."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Validate Quantities
    |--------------------------------------------------------------------------
    */

    if (receivedQuantity > quantity) {
      return errorResponse(
        res,
        400,
        "Received quantity cannot be greater than ordered quantity."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Calculate Line Amounts
    |--------------------------------------------------------------------------
    */

    const lineSubtotal =
      Number(quantity) * Number(purchasePrice);

    if (Number(discount) > lineSubtotal) {
      return errorResponse(
        res,
        400,
        "Discount cannot be greater than line subtotal."
      );
    }

    const lineTotal =
      lineSubtotal -
      Number(discount) +
      Number(tax);


    /*
    |--------------------------------------------------------------------------
    | Prevent Duplicate Item
    |--------------------------------------------------------------------------
    */

    const existingItem = await PurchaseItem.findOne({
      business: businessId,
      purchase,
      productInventory,
    });

    if (existingItem) {
      return errorResponse(
        res,
        409,
        "This product inventory already exists in this purchase."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Create Purchase Item
    |--------------------------------------------------------------------------
    */

    const purchaseItem = await PurchaseItem.create({
      business: businessId,
      purchase,
      product,
      productInventory,
      quantity,
      receivedQuantity,
      purchasePrice,
      discount,
      tax,
      lineSubtotal,
      lineTotal,
      createdBy: req.user._id,
    });


    /*
    |--------------------------------------------------------------------------
    | Populate Response
    |--------------------------------------------------------------------------
    */

    await purchaseItem.populate([
      {
        path: "business",
        select: "name",
      },
      {
        path: "purchase",
        select: "purchaseNumber purchaseDate status paymentStatus",
      },
      {
        path: "product",
        select: "name sku barcode",
      },
      {
        path: "productInventory",
        select:
          "color size quantity minStock maxStock purchasePrice salePrice",
      },
      {
        path: "createdBy",
        select: "name email",
      },
      {
        path: "updatedBy",
        select: "name email",
      },
    ]);


    return successResponse(
      res,
      201,
      "Purchase item created successfully.",
      purchaseItem
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get All Purchase Items
|--------------------------------------------------------------------------
*/

export const getAllPurchaseItems = async (req, res, next) => {
  try {
    const businessId = getBusinessId(req, false);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const {
      purchase,
      product,
      productInventory,
      search = "",
      page = 1,
      limit = 20,
    } = req.query;


    /*
    |--------------------------------------------------------------------------
    | Base Filter
    |--------------------------------------------------------------------------
    */

    const filter = {
      business: businessId,
    };


    /*
    |--------------------------------------------------------------------------
    | Purchase Filter
    |--------------------------------------------------------------------------
    */

    if (purchase) {
      if (!isValidObjectId(purchase)) {
        return errorResponse(
          res,
          400,
          "Invalid purchase ID."
        );
      }

      filter.purchase = purchase;
    }


    /*
    |--------------------------------------------------------------------------
    | Product Filter
    |--------------------------------------------------------------------------
    */

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


    /*
    |--------------------------------------------------------------------------
    | Product Inventory Filter
    |--------------------------------------------------------------------------
    */

    if (productInventory) {
      if (!isValidObjectId(productInventory)) {
        return errorResponse(
          res,
          400,
          "Invalid product inventory ID."
        );
      }

      filter.productInventory = productInventory;
    }


    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    */

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const itemsLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (currentPage - 1) * itemsLimit;


    /*
    |--------------------------------------------------------------------------
    | Search
    |--------------------------------------------------------------------------
    |
    | PurchaseItem itself does not contain product name or SKU.
    | We search those through Product after finding matching IDs.
    |
    */

    if (search.trim()) {
      const searchRegex = new RegExp(
        search.trim(),
        "i"
      );

      const matchingProducts = await Product.find({
        business: businessId,
        $or: [
          { name: searchRegex },
          { sku: searchRegex },
          { barcode: searchRegex },
        ],
      }).select("_id");

      filter.product = {
        $in: matchingProducts.map(
          (item) => item._id
        ),
      };
    }


    /*
    |--------------------------------------------------------------------------
    | Fetch Items
    |--------------------------------------------------------------------------
    */

    const [purchaseItems, total] =
      await Promise.all([
        PurchaseItem.find(filter)
          .populate({
            path: "business",
            select: "name",
          })
          .populate({
            path: "purchase",
            select:
              "purchaseNumber purchaseDate supplier status paymentStatus totalAmount",
          })
          .populate({
            path: "product",
            select:
              "name sku barcode productType unit",
          })
          .populate({
            path: "productInventory",
            select:
              "color size quantity minStock maxStock purchasePrice salePrice",
          })
          .populate({
            path: "createdBy",
            select: "name email",
          })
          .populate({
            path: "updatedBy",
            select: "name email",
          })
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(itemsLimit),

        PurchaseItem.countDocuments(filter),
      ]);


    return successResponse(
      res,
      200,
      "Purchase items fetched successfully.",
      {
        purchaseItems,
        pagination: {
          total,
          page: currentPage,
          limit: itemsLimit,
          totalPages: Math.ceil(
            total / itemsLimit
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get Purchase Items By Purchase
|--------------------------------------------------------------------------
|
| Very useful for:
| GET /api/purchase-items/purchase/:purchaseId
|
*/

export const getPurchaseItemsByPurchase = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req, false);
    const { purchaseId } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!isValidObjectId(purchaseId)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Make Sure Purchase Belongs To Business
    |--------------------------------------------------------------------------
    */

    const purchaseRecord = await Purchase.findOne({
      _id: purchaseId,
      business: businessId,
    });

    if (!purchaseRecord) {
      return errorResponse(
        res,
        404,
        "Purchase not found for this business."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Get Items
    |--------------------------------------------------------------------------
    */

    const purchaseItems =
      await PurchaseItem.find({
        business: businessId,
        purchase: purchaseId,
      })
        .populate({
          path: "product",
          select:
            "name sku barcode productType unit",
        })
        .populate({
          path: "productInventory",
          select:
            "color size quantity minStock maxStock purchasePrice salePrice",
        })
        .populate({
          path: "createdBy",
          select: "name email",
        })
        .sort({
          createdAt: 1,
        });


    return successResponse(
      res,
      200,
      "Purchase items fetched successfully.",
      purchaseItems
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get Single Purchase Item
|--------------------------------------------------------------------------
*/

export const getPurchaseItemById = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req, false);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase item ID."
      );
    }


    const purchaseItem =
      await PurchaseItem.findOne({
        _id: id,
        business: businessId,
      })
        .populate({
          path: "business",
          select: "name",
        })
        .populate({
          path: "purchase",
          select:
            "purchaseNumber purchaseDate supplier status paymentStatus totalAmount",
        })
        .populate({
          path: "product",
          select:
            "name sku barcode productType unit",
        })
        .populate({
          path: "productInventory",
          select:
            "color size quantity minStock maxStock purchasePrice salePrice",
        })
        .populate({
          path: "createdBy",
          select: "name email",
        })
        .populate({
          path: "updatedBy",
          select: "name email",
        });


    if (!purchaseItem) {
      return errorResponse(
        res,
        404,
        "Purchase item not found."
      );
    }


    return successResponse(
      res,
      200,
      "Purchase item fetched successfully.",
      purchaseItem
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Update Purchase Item
|--------------------------------------------------------------------------
*/

export const updatePurchaseItem = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req, false);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase item ID."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Find Existing Item
    |--------------------------------------------------------------------------
    */

    const purchaseItem =
      await PurchaseItem.findOne({
        _id: id,
        business: businessId,
      });

    if (!purchaseItem) {
      return errorResponse(
        res,
        404,
        "Purchase item not found."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Check Purchase
    |--------------------------------------------------------------------------
    */

    const purchaseId =
      req.body.purchase || purchaseItem.purchase;

    if (!isValidObjectId(purchaseId)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase ID."
      );
    }

    const purchaseRecord =
      await Purchase.findOne({
        _id: purchaseId,
        business: businessId,
      });

    if (!purchaseRecord) {
      return errorResponse(
        res,
        404,
        "Purchase not found for this business."
      );
    }

    if (purchaseRecord.status === "cancelled") {
      return errorResponse(
        res,
        400,
        "Cannot update items of a cancelled purchase."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Resolve Product
    |--------------------------------------------------------------------------
    */

    const productId =
      req.body.product || purchaseItem.product;

    if (!isValidObjectId(productId)) {
      return errorResponse(
        res,
        400,
        "Invalid product ID."
      );
    }

    const productRecord =
      await Product.findOne({
        _id: productId,
        business: businessId,
        isActive: true,
      });

    if (!productRecord) {
      return errorResponse(
        res,
        404,
        "Product not found for this business."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Resolve Inventory
    |--------------------------------------------------------------------------
    */

    const inventoryId =
      req.body.productInventory ||
      purchaseItem.productInventory;

    if (!isValidObjectId(inventoryId)) {
      return errorResponse(
        res,
        400,
        "Invalid product inventory ID."
      );
    }

    const inventoryRecord =
      await ProductInventory.findOne({
        _id: inventoryId,
        business: businessId,
        product: productId,
        isActive: true,
      });

    if (!inventoryRecord) {
      return errorResponse(
        res,
        404,
        "Product inventory not found for this product and business."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Resolve Values
    |--------------------------------------------------------------------------
    */

    const quantity =
      req.body.quantity !== undefined
        ? Number(req.body.quantity)
        : purchaseItem.quantity;

    const receivedQuantity =
      req.body.receivedQuantity !== undefined
        ? Number(req.body.receivedQuantity)
        : purchaseItem.receivedQuantity;

    const purchasePrice =
      req.body.purchasePrice !== undefined
        ? Number(req.body.purchasePrice)
        : purchaseItem.purchasePrice;

    const discount =
      req.body.discount !== undefined
        ? Number(req.body.discount)
        : purchaseItem.discount;

    const tax =
      req.body.tax !== undefined
        ? Number(req.body.tax)
        : purchaseItem.tax;


    /*
    |--------------------------------------------------------------------------
    | Quantity Validation
    |--------------------------------------------------------------------------
    */

    if (receivedQuantity > quantity) {
      return errorResponse(
        res,
        400,
        "Received quantity cannot be greater than ordered quantity."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Recalculate Amounts
    |--------------------------------------------------------------------------
    */

    const lineSubtotal =
      quantity * purchasePrice;

    if (discount > lineSubtotal) {
      return errorResponse(
        res,
        400,
        "Discount cannot be greater than line subtotal."
      );
    }

    const lineTotal =
      lineSubtotal - discount + tax;


    /*
    |--------------------------------------------------------------------------
    | Duplicate Check
    |--------------------------------------------------------------------------
    */

    const duplicateItem =
      await PurchaseItem.findOne({
        _id: { $ne: id },
        business: businessId,
        purchase: purchaseId,
        productInventory: inventoryId,
      });

    if (duplicateItem) {
      return errorResponse(
        res,
        409,
        "This product inventory already exists in this purchase."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    purchaseItem.purchase = purchaseId;
    purchaseItem.product = productId;
    purchaseItem.productInventory = inventoryId;
    purchaseItem.quantity = quantity;
    purchaseItem.receivedQuantity = receivedQuantity;
    purchaseItem.purchasePrice = purchasePrice;
    purchaseItem.discount = discount;
    purchaseItem.tax = tax;
    purchaseItem.lineSubtotal = lineSubtotal;
    purchaseItem.lineTotal = lineTotal;
    purchaseItem.updatedBy = req.user._id;

    await purchaseItem.save();


    /*
    |--------------------------------------------------------------------------
    | Populate Response
    |--------------------------------------------------------------------------
    */

    await purchaseItem.populate([
      {
        path: "business",
        select: "name",
      },
      {
        path: "purchase",
        select:
          "purchaseNumber purchaseDate status paymentStatus",
      },
      {
        path: "product",
        select:
          "name sku barcode productType unit",
      },
      {
        path: "productInventory",
        select:
          "color size quantity minStock maxStock purchasePrice salePrice",
      },
      {
        path: "createdBy",
        select: "name email",
      },
      {
        path: "updatedBy",
        select: "name email",
      },
    ]);


    return successResponse(
      res,
      200,
      "Purchase item updated successfully.",
      purchaseItem
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Delete Purchase Item
|--------------------------------------------------------------------------
|
| PurchaseItem does not have isActive.
| Therefore we permanently remove the item.
|
| Later, if you want a full audit/history system,
| StockMovement and AuditLog will preserve important history.
|
*/

export const deletePurchaseItem = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req, false);
    const { id } = req.params;

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid purchase item ID."
      );
    }


    const purchaseItem =
      await PurchaseItem.findOne({
        _id: id,
        business: businessId,
      });

    if (!purchaseItem) {
      return errorResponse(
        res,
        404,
        "Purchase item not found."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Check Purchase Status
    |--------------------------------------------------------------------------
    */

    const purchaseRecord =
      await Purchase.findOne({
        _id: purchaseItem.purchase,
        business: businessId,
      });

    if (!purchaseRecord) {
      return errorResponse(
        res,
        404,
        "Purchase not found."
      );
    }

    if (purchaseRecord.status === "cancelled") {
      return errorResponse(
        res,
        400,
        "Cannot delete items from a cancelled purchase."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Prevent Delete If Already Received
    |--------------------------------------------------------------------------
    */

    if (purchaseItem.receivedQuantity > 0) {
      return errorResponse(
        res,
        400,
        "Cannot delete a purchase item that has already been received."
      );
    }


    await PurchaseItem.deleteOne({
      _id: id,
      business: businessId,
    });


    return successResponse(
      res,
      200,
      "Purchase item deleted successfully."
    );
  } catch (error) {
    next(error);
  }
};