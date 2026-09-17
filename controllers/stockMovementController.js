import mongoose from "mongoose";

import StockMovement from "../models/StockMovement.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import Business from "../models/Business.js";
import Purchase from "../models/Purchase.js";
import PurchaseItem from "../models/PurchaseItem.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

/*
|--------------------------------------------------------------------------
| Helpers
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

  return req.user?.business?._id || req.user?.business;
};

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
| Create Stock Movement
|--------------------------------------------------------------------------
*/

export const createStockMovement = async (req, res) => {
  try {
    const {
      product,
      productInventory,
      movementType,
      adjustmentType,
      quantity,
      referenceType,
      referenceId,
      purchase,
      purchaseItem,
      sale,
      saleItem,
      reason,
      notes,
    } = req.body;

    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Business
    |--------------------------------------------------------------------------
    */

    const business = await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found or inactive."
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

    const productDoc = await Product.findOne({
      _id: product,
      business: businessId,
      isActive: true,
    });

    if (!productDoc) {
      return errorResponse(
        res,
        404,
        "Product not found."
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

    const inventory = await ProductInventory.findOne({
      _id: productInventory,
      business: businessId,
      product: product,
      isActive: true,
    });

    if (!inventory) {
      return errorResponse(
        res,
        404,
        "Product inventory not found."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Calculate New Stock
    |--------------------------------------------------------------------------
    */

    const previousQuantity = inventory.quantity;

    let newQuantity = previousQuantity;

    if (movementType === "in") {
      newQuantity =
        previousQuantity + quantity;
    }

    if (movementType === "out") {
      if (previousQuantity < quantity) {
        return errorResponse(
          res,
          400,
          `Insufficient stock. Available stock is ${previousQuantity}.`
        );
      }

      newQuantity =
        previousQuantity - quantity;
    }

    if (movementType === "adjustment") {
      if (adjustmentType === "increase") {
        newQuantity =
          previousQuantity + quantity;
      }

      if (adjustmentType === "decrease") {
        if (previousQuantity < quantity) {
          return errorResponse(
            res,
            400,
            `Cannot decrease stock by ${quantity}. Available stock is ${previousQuantity}.`
          );
        }

        newQuantity =
          previousQuantity - quantity;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Purchase Reference
    |--------------------------------------------------------------------------
    */

    if (referenceType === "purchase") {
      if (!purchase || !purchaseItem) {
        return errorResponse(
          res,
          400,
          "Purchase and purchase item are required for purchase stock movement."
        );
      }

      const purchaseDoc = await Purchase.findOne({
        _id: purchase,
        business: businessId,
      });

      if (!purchaseDoc) {
        return errorResponse(
          res,
          404,
          "Purchase not found."
        );
      }

      if (purchaseDoc.status === "cancelled") {
        return errorResponse(
          res,
          400,
          "Cannot create stock movement for a cancelled purchase."
        );
      }

      const purchaseItemDoc =
        await PurchaseItem.findOne({
          _id: purchaseItem,
          purchase: purchase,
          business: businessId,
          product: product,
          productInventory: productInventory,
        });

      if (!purchaseItemDoc) {
        return errorResponse(
          res,
          404,
          "Purchase item not found."
        );
      }

      const remainingQuantity =
        purchaseItemDoc.quantity -
        purchaseItemDoc.receivedQuantity;

      if (quantity > remainingQuantity) {
        return errorResponse(
          res,
          400,
          `Only ${remainingQuantity} quantity is remaining to receive.`
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Prevent Invalid Reference Combinations
    |--------------------------------------------------------------------------
    */

    if (
      referenceType !== "purchase" &&
      (purchase || purchaseItem)
    ) {
      return errorResponse(
        res,
        400,
        "Purchase references are only allowed for purchase movements."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Start MongoDB Transaction
    |--------------------------------------------------------------------------
    */

    const session =
      await mongoose.startSession();

    try {
      session.startTransaction();

      /*
      |--------------------------------------------------------------------------
      | Update Inventory
      |--------------------------------------------------------------------------
      */

      const updatedInventory =
        await ProductInventory.findOneAndUpdate(
          {
            _id: productInventory,
            business: businessId,
            product: product,
            isActive: true,
          },
          {
            $set: {
              quantity: newQuantity,
              updatedBy: req.user._id,
            },
          },
          {
            new: true,
            session,
          }
        );

      if (!updatedInventory) {
        throw new Error(
          "Product inventory could not be updated."
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Create Stock Movement
      |--------------------------------------------------------------------------
      */

      const movementData = {
        business: businessId,
        product,
        productInventory,
        movementType,
        adjustmentType:
          movementType === "adjustment"
            ? adjustmentType
            : null,
        quantity,
        previousQuantity,
        newQuantity,
        referenceType,
        referenceId:
          referenceId || null,
        purchase:
          purchase || null,
        purchaseItem:
          purchaseItem || null,
        sale:
          sale || null,
        saleItem:
          saleItem || null,
        reason: reason || "",
        notes: notes || "",
        createdBy: req.user._id,
      };

      const [movement] =
        await StockMovement.create(
          [movementData],
          { session }
        );

      /*
      |--------------------------------------------------------------------------
      | Update Purchase Item Receiving Quantity
      |--------------------------------------------------------------------------
      */

      if (
        referenceType === "purchase" &&
        purchaseItem
      ) {
        const updatedPurchaseItem =
          await PurchaseItem.findOneAndUpdate(
            {
              _id: purchaseItem,
              business: businessId,
            },
            {
              $inc: {
                receivedQuantity: quantity,
              },
            },
            {
              new: true,
              session,
            }
          );

        if (!updatedPurchaseItem) {
          throw new Error(
            "Purchase item could not be updated."
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Update Purchase Status
        |--------------------------------------------------------------------------
        */

        const purchaseItems =
          await PurchaseItem.find({
            purchase,
            business: businessId,
          }).session(session);

        const allReceived =
          purchaseItems.length > 0 &&
          purchaseItems.every(
            (item) =>
              item.receivedQuantity >=
              item.quantity
          );

        const someReceived =
          purchaseItems.some(
            (item) =>
              item.receivedQuantity > 0
          );

        let purchaseStatus = "draft";

        if (allReceived) {
          purchaseStatus = "received";
        } else if (someReceived) {
          purchaseStatus =
            "partially_received";
        }

        await Purchase.findOneAndUpdate(
          {
            _id: purchase,
            business: businessId,
          },
          {
            $set: {
              status: purchaseStatus,
              updatedBy: req.user._id,
            },
          },
          {
            new: true,
            session,
          }
        );
      }

      await session.commitTransaction();

      /*
      |--------------------------------------------------------------------------
      | Populate Result
      |--------------------------------------------------------------------------
      */

      const result =
        await StockMovement.findById(
          movement._id
        )
          .populate(
            "business",
            "name"
          )
          .populate(
            "product",
            "name sku barcode"
          )
          .populate(
            "productInventory",
            "color size quantity salePrice purchasePrice"
          )
          .populate(
            "purchase",
            "purchaseNumber purchaseDate status"
          )
          .populate(
            "purchaseItem",
            "quantity receivedQuantity purchasePrice"
          )
          .populate(
            "createdBy",
            "name email"
          );

      return successResponse(
        res,
        201,
        "Stock movement created successfully.",
        result
      );
    } catch (transactionError) {
      await session.abortTransaction();

      console.error(
        "Stock movement transaction error:",
        transactionError
      );

      return errorResponse(
        res,
        500,
        transactionError.message ||
          "Stock movement transaction failed."
      );
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error(
      "Create stock movement error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to create stock movement."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Get All Stock Movements
|--------------------------------------------------------------------------
*/

export const getAllStockMovements = async (
  req,
  res
) => {
  try {
    const businessId = getBusinessId(
      req,
      false
    );

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const {
      page = 1,
      limit = 20,
      product,
      productInventory,
      movementType,
      referenceType,
      purchase,
      search,
      startDate,
      endDate,
    } = req.query;

    const currentPage =
      Math.max(Number(page), 1);

    const currentLimit = Math.min(
      Math.max(Number(limit), 1),
      100
    );

    const skip =
      (currentPage - 1) *
      currentLimit;

    const filter = {
      business: businessId,
    };

    /*
    |--------------------------------------------------------------------------
    | Filters
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

      filter.productInventory =
        productInventory;
    }

    if (movementType) {
      filter.movementType =
        movementType;
    }

    if (referenceType) {
      filter.referenceType =
        referenceType;
    }

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
    | Date Filter
    |--------------------------------------------------------------------------
    */

    if (startDate || endDate) {
      filter.createdAt = {};

      if (startDate) {
        filter.createdAt.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const end =
          new Date(endDate);

        end.setHours(
          23,
          59,
          59,
          999
        );

        filter.createdAt.$lte =
          end;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Search Product
    |--------------------------------------------------------------------------
    */

    if (search?.trim()) {
      const products =
        await Product.find({
          business: businessId,
          $or: [
            {
              name: {
                $regex: search.trim(),
                $options: "i",
              },
            },
            {
              sku: {
                $regex: search.trim(),
                $options: "i",
              },
            },
            {
              barcode: {
                $regex: search.trim(),
                $options: "i",
              },
            },
          ],
        }).select("_id");

      const productIds =
        products.map(
          (item) => item._id
        );

      filter.product = {
        $in: productIds,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Query
    |--------------------------------------------------------------------------
    */

    const [
      movements,
      total,
    ] = await Promise.all([
      StockMovement.find(filter)
        .populate(
          "product",
          "name sku barcode"
        )
        .populate(
          "productInventory",
          "color size quantity"
        )
        .populate(
          "purchase",
          "purchaseNumber purchaseDate status"
        )
        .populate(
          "purchaseItem",
          "quantity receivedQuantity purchasePrice"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(currentLimit),

      StockMovement.countDocuments(
        filter
      ),
    ]);

    return successResponse(
      res,
      200,
      "Stock movements fetched successfully.",
      {
        movements,
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
    console.error(
      "Get stock movements error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch stock movements."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Get Stock Movement By ID
|--------------------------------------------------------------------------
*/

export const getStockMovementById = async (
  req,
  res
) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid stock movement ID."
      );
    }

    const businessId = getBusinessId(
      req,
      false
    );

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const movement =
      await StockMovement.findOne({
        _id: id,
        business: businessId,
      })
        .populate(
          "business",
          "name"
        )
        .populate(
          "product",
          "name sku barcode"
        )
        .populate(
          "productInventory",
          "color size quantity salePrice purchasePrice"
        )
        .populate(
          "purchase",
          "purchaseNumber purchaseDate status"
        )
        .populate(
          "purchaseItem",
          "quantity receivedQuantity purchasePrice"
        )
        .populate(
          "createdBy",
          "name email"
        );

    if (!movement) {
      return errorResponse(
        res,
        404,
        "Stock movement not found."
      );
    }

    return successResponse(
      res,
      200,
      "Stock movement fetched successfully.",
      movement
    );
  } catch (error) {
    console.error(
      "Get stock movement error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch stock movement."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Get Movements By Product
|--------------------------------------------------------------------------
*/

export const getMovementsByProduct =
  async (req, res) => {
    try {
      const { productId } =
        req.params;

      if (
        !isValidObjectId(productId)
      ) {
        return errorResponse(
          res,
          400,
          "Invalid product ID."
        );
      }

      const businessId =
        getBusinessId(
          req,
          false
        );

      if (!businessId) {
        return errorResponse(
          res,
          400,
          "Business is required."
        );
      }

      const product =
        await Product.findOne({
          _id: productId,
          business: businessId,
        });

      if (!product) {
        return errorResponse(
          res,
          404,
          "Product not found."
        );
      }

      const movements =
        await StockMovement.find({
          business: businessId,
          product: productId,
        })
          .populate(
            "productInventory",
            "color size quantity"
          )
          .populate(
            "purchase",
            "purchaseNumber purchaseDate"
          )
          .populate(
            "purchaseItem",
            "quantity receivedQuantity purchasePrice"
          )
          .populate(
            "createdBy",
            "name email"
          )
          .sort({
            createdAt: -1,
          });

      return successResponse(
        res,
        200,
        "Product stock movements fetched successfully.",
        movements
      );
    } catch (error) {
      console.error(
        "Get product stock movements error:",
        error
      );

      return errorResponse(
        res,
        500,
        "Failed to fetch product stock movements."
      );
    }
  };