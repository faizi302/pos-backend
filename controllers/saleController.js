import mongoose from "mongoose";

import Sale from "../models/Sale.js";
import Customer from "../models/Customer.js";
import Business from "../models/Business.js";

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

const getBusinessId = (
  req,
  allowBody = true
) => {
  if (isSuperAdmin(req)) {
    if (
      allowBody &&
      req.body?.business
    ) {
      return req.body.business;
    }

    if (req.query?.business) {
      return req.query.business;
    }

    return null;
  }

  return (
    req.user?.business?._id ||
    req.user?.business
  );
};

const validateBusiness = async (
  businessId
) => {
  if (
    !businessId ||
    !isValidObjectId(businessId)
  ) {
    return null;
  }

  return Business.findOne({
    _id: businessId,
    isActive: true,
  });
};

/*
|--------------------------------------------------------------------------
| Generate Sale Number
|--------------------------------------------------------------------------
*/

const generateSaleNumber = async (
  businessId
) => {
  const latestSale =
    await Sale.findOne({
      business: businessId,
    })
      .sort({
        createdAt: -1,
      })
      .select("saleNumber");

  let nextNumber = 1;

  if (latestSale?.saleNumber) {
    const match =
      latestSale.saleNumber.match(
        /SAL-(\d+)/
      );

    if (match) {
      nextNumber =
        Number(match[1]) + 1;
    }
  }

  return `SAL-${String(
    nextNumber
  ).padStart(6, "0")}`;
};

/*
|--------------------------------------------------------------------------
| Create Sale
|--------------------------------------------------------------------------
*/

export const createSale = async (
  req,
  res
) => {
  try {
    const {
      customer,
      saleNumber,
      saleDate,
      status,
      subtotal = 0,
      discount = 0,
      tax = 0,
      shippingCost = 0,
      otherCharges = 0,
      totalAmount = 0,
      paidAmount = 0,
      paymentMethod = "cash",
      referenceNumber = "",
      notes = "",
    } = req.body;

    const businessId =
      getBusinessId(req);

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

    const business =
      await validateBusiness(
        businessId
      );

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found or inactive."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Customer
    |--------------------------------------------------------------------------
    */

    let customerId = null;

    if (customer) {
      if (
        !isValidObjectId(customer)
      ) {
        return errorResponse(
          res,
          400,
          "Invalid customer ID."
        );
      }

      const customerDoc =
        await Customer.findOne({
          _id: customer,
          business: businessId,
          isActive: true,
        });

      if (!customerDoc) {
        return errorResponse(
          res,
          404,
          "Customer not found."
        );
      }

      customerId =
        customerDoc._id;
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Amounts
    |--------------------------------------------------------------------------
    */

    if (
      paidAmount > totalAmount
    ) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be greater than total amount."
      );
    }

    const calculatedDueAmount =
      Math.max(
        totalAmount - paidAmount,
        0
      );

    /*
    |--------------------------------------------------------------------------
    | Payment Status
    |--------------------------------------------------------------------------
    */

    let paymentStatus =
      "unpaid";

    if (
      paidAmount > 0 &&
      paidAmount < totalAmount
    ) {
      paymentStatus =
        "partially_paid";
    }

    if (
      totalAmount > 0 &&
      paidAmount === totalAmount
    ) {
      paymentStatus = "paid";
    }

    /*
    |--------------------------------------------------------------------------
    | Sale Number
    |--------------------------------------------------------------------------
    */

    const finalSaleNumber =
      saleNumber ||
      (await generateSaleNumber(
        businessId
      ));

    /*
    |--------------------------------------------------------------------------
    | Duplicate Sale Number
    |--------------------------------------------------------------------------
    */

    const existingSale =
      await Sale.findOne({
        business: businessId,
        saleNumber:
          finalSaleNumber,
      });

    if (existingSale) {
      return errorResponse(
        res,
        409,
        "Sale number already exists."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Sale
    |--------------------------------------------------------------------------
    */

    const sale =
      await Sale.create({
        business: businessId,
        customer: customerId,
        saleNumber:
          finalSaleNumber,
        saleDate:
          saleDate || new Date(),
        status:
          status || "draft",
        subtotal,
        discount,
        tax,
        shippingCost,
        otherCharges,
        totalAmount,
        paidAmount,
        dueAmount:
          calculatedDueAmount,
        paymentStatus,
        paymentMethod,
        referenceNumber,
        notes,
        createdBy:
          req.user._id,
      });

    /*
    |--------------------------------------------------------------------------
    | Populate
    |--------------------------------------------------------------------------
    */

    const populatedSale =
      await Sale.findById(
        sale._id
      )
        .populate(
          "business",
          "name"
        )
        .populate(
          "customer",
          "name phone email"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    return successResponse(
      res,
      201,
      "Sale created successfully.",
      populatedSale
    );
  } catch (error) {
    console.error(
      "Create sale error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to create sale."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Get All Sales
|--------------------------------------------------------------------------
*/

export const getAllSales = async (
  req,
  res
) => {
  try {
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

    const {
      page = 1,
      limit = 20,
      search,
      customer,
      status,
      paymentStatus,
      paymentMethod,
      startDate,
      endDate,
    } = req.query;

    const currentPage =
      Math.max(
        Number(page),
        1
      );

    const currentLimit =
      Math.min(
        Math.max(
          Number(limit),
          1
        ),
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
    | Search
    |--------------------------------------------------------------------------
    */

    if (search?.trim()) {
      filter.$or = [
        {
          saleNumber: {
            $regex:
              search.trim(),
            $options: "i",
          },
        },
        {
          referenceNumber: {
            $regex:
              search.trim(),
            $options: "i",
          },
        },
      ];
    }

    /*
    |--------------------------------------------------------------------------
    | Customer
    |--------------------------------------------------------------------------
    */

    if (customer) {
      if (
        !isValidObjectId(customer)
      ) {
        return errorResponse(
          res,
          400,
          "Invalid customer ID."
        );
      }

      filter.customer =
        customer;
    }

    /*
    |--------------------------------------------------------------------------
    | Filters
    |--------------------------------------------------------------------------
    */

    if (status) {
      filter.status =
        status;
    }

    if (paymentStatus) {
      filter.paymentStatus =
        paymentStatus;
    }

    if (paymentMethod) {
      filter.paymentMethod =
        paymentMethod;
    }

    /*
    |--------------------------------------------------------------------------
    | Date Range
    |--------------------------------------------------------------------------
    */

    if (
      startDate ||
      endDate
    ) {
      filter.saleDate = {};

      if (startDate) {
        filter.saleDate.$gte =
          new Date(startDate);
      }

      if (endDate) {
        const endDateValue =
          new Date(endDate);

        endDateValue.setHours(
          23,
          59,
          59,
          999
        );

        filter.saleDate.$lte =
          endDateValue;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Fetch
    |--------------------------------------------------------------------------
    */

    const [
      sales,
      total,
    ] = await Promise.all([
      Sale.find(filter)
        .populate(
          "customer",
          "name phone email"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        )
        .sort({
          saleDate: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(currentLimit),

      Sale.countDocuments(
        filter
      ),
    ]);

    return successResponse(
      res,
      200,
      "Sales fetched successfully.",
      {
        sales,
        pagination: {
          total,
          page: currentPage,
          limit: currentLimit,
          totalPages:
            Math.ceil(
              total /
                currentLimit
            ),
        },
      }
    );
  } catch (error) {
    console.error(
      "Get sales error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sales."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Get Sale By ID
|--------------------------------------------------------------------------
*/

export const getSaleById = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
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

    const sale =
      await Sale.findOne({
        _id: id,
        business: businessId,
      })
        .populate(
          "business",
          "name"
        )
        .populate(
          "customer",
          "name phone email address"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    return successResponse(
      res,
      200,
      "Sale fetched successfully.",
      sale
    );
  } catch (error) {
    console.error(
      "Get sale error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to fetch sale."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Update Sale
|--------------------------------------------------------------------------
*/

export const updateSale = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
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

    const sale =
      await Sale.findOne({
        _id: id,
        business: businessId,
      });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Prevent Editing Completed Sales
    |--------------------------------------------------------------------------
    */

    if (
      sale.status ===
        "completed" ||
      sale.status ===
        "partially_returned" ||
      sale.status ===
        "returned"
    ) {
      return errorResponse(
        res,
        400,
        "Completed or returned sales cannot be edited."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Customer
    |--------------------------------------------------------------------------
    */

    if (
      req.body.customer !==
        undefined
    ) {
      if (
        req.body.customer ===
        null
      ) {
        sale.customer =
          null;
      } else {
        if (
          !isValidObjectId(
            req.body.customer
          )
        ) {
          return errorResponse(
            res,
            400,
            "Invalid customer ID."
          );
        }

        const customer =
          await Customer.findOne({
            _id:
              req.body.customer,
            business:
              businessId,
            isActive: true,
          });

        if (!customer) {
          return errorResponse(
            res,
            404,
            "Customer not found."
          );
        }

        sale.customer =
          customer._id;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Sale Number
    |--------------------------------------------------------------------------
    */

    if (
      req.body.saleNumber &&
      req.body.saleNumber !==
        sale.saleNumber
    ) {
      const duplicateSale =
        await Sale.findOne({
          _id: {
            $ne: sale._id,
          },
          business:
            businessId,
          saleNumber:
            req.body.saleNumber,
        });

      if (duplicateSale) {
        return errorResponse(
          res,
          409,
          "Sale number already exists."
        );
      }

      sale.saleNumber =
        req.body.saleNumber;
    }

    /*
    |--------------------------------------------------------------------------
    | Update Allowed Fields
    |--------------------------------------------------------------------------
    */

    const allowedFields = [
      "saleDate",
      "status",
      "subtotal",
      "discount",
      "tax",
      "shippingCost",
      "otherCharges",
      "totalAmount",
      "paidAmount",
      "paymentMethod",
      "referenceNumber",
      "notes",
    ];

    allowedFields.forEach(
      (field) => {
        if (
          req.body[field] !==
          undefined
        ) {
          sale[field] =
            req.body[field];
        }
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Validate Payment
    |--------------------------------------------------------------------------
    */

    if (
      sale.paidAmount >
      sale.totalAmount
    ) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be greater than total amount."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Recalculate Due
    |--------------------------------------------------------------------------
    */

    sale.dueAmount =
      Math.max(
        sale.totalAmount -
          sale.paidAmount,
        0
      );

    /*
    |--------------------------------------------------------------------------
    | Recalculate Payment Status
    |--------------------------------------------------------------------------
    */

    if (
      sale.totalAmount === 0
    ) {
      sale.paymentStatus =
        "paid";
    } else if (
      sale.paidAmount === 0
    ) {
      sale.paymentStatus =
        "unpaid";
    } else if (
      sale.paidAmount <
      sale.totalAmount
    ) {
      sale.paymentStatus =
        "partially_paid";
    } else {
      sale.paymentStatus =
        "paid";
    }

    sale.updatedBy =
      req.user._id;

    await sale.save();

    /*
    |--------------------------------------------------------------------------
    | Populate
    |--------------------------------------------------------------------------
    */

    const updatedSale =
      await Sale.findById(
        sale._id
      )
        .populate(
          "business",
          "name"
        )
        .populate(
          "customer",
          "name phone email"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    return successResponse(
      res,
      200,
      "Sale updated successfully.",
      updatedSale
    );
  } catch (error) {
    console.error(
      "Update sale error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to update sale."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Cancel Sale
|--------------------------------------------------------------------------
*/

export const cancelSale = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
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

    const sale =
      await Sale.findOne({
        _id: id,
        business: businessId,
      });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    if (
      sale.status ===
      "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Sale is already cancelled."
      );
    }

    if (
      sale.status ===
        "completed" ||
      sale.status ===
        "partially_returned" ||
      sale.status ===
        "returned"
    ) {
      return errorResponse(
        res,
        400,
        "Completed sales cannot be cancelled. Use sale return instead."
      );
    }

    sale.status =
      "cancelled";

    sale.updatedBy =
      req.user._id;

    await sale.save();

    return successResponse(
      res,
      200,
      "Sale cancelled successfully.",
      sale
    );
  } catch (error) {
    console.error(
      "Cancel sale error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to cancel sale."
    );
  }
};

/*
|--------------------------------------------------------------------------
| Restore Sale
|--------------------------------------------------------------------------
*/

export const restoreSale = async (
  req,
  res
) => {
  try {
    const { id } =
      req.params;

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
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

    const sale =
      await Sale.findOne({
        _id: id,
        business: businessId,
      });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    if (
      sale.status !==
      "cancelled"
    ) {
      return errorResponse(
        res,
        400,
        "Only cancelled sales can be restored."
      );
    }

    sale.status =
      "draft";

    sale.updatedBy =
      req.user._id;

    await sale.save();

    return successResponse(
      res,
      200,
      "Sale restored successfully.",
      sale
    );
  } catch (error) {
    console.error(
      "Restore sale error:",
      error
    );

    return errorResponse(
      res,
      500,
      "Failed to restore sale."
    );
  }
};