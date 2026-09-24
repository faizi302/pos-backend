import Sale from "../models/Sale.js";
import Customer from "../models/Customer.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";
import SaleItem from "../models/SaleItem.js";
import ProductInventory from "../models/ProductInventory.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

import {
  getTenantContext,
  buildTenantQuery,
  buildTenantBusinessQuery,
  isValidObjectId,
} from "../utils/tenantContext.js";

// ======================================================
// HELPERS
// ======================================================

// ------------------------------------------------------
// VALIDATE BUSINESS
// ------------------------------------------------------

const validateBusiness = async (businessId) => {
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

// ------------------------------------------------------
// VALIDATE BUSINESS TYPE
// ------------------------------------------------------
//
// BusinessType must belong to selected Business.
//

const validateBusinessType = async (
  businessTypeId,
  businessId
) => {
  if (
    !businessTypeId ||
    !isValidObjectId(businessTypeId) ||
    !businessId ||
    !isValidObjectId(businessId)
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
// GET SUPER ADMIN FILTER
// ======================================================
//
// Super Admin can optionally filter using:
//
// ?tenantOwner=...
// ?business=...
// ?businessType=...
//
// These are filters only.
//
// They are NOT used as tenant isolation for
// Admin / Manager users.
//

const getSuperAdminFilter = async (req) => {
  const tenantOwner =
    req.query?.tenantOwner || null;

  const businessId =
    req.query?.business || null;

  const businessTypeId =
    req.query?.businessType || null;

  // ----------------------------------------------------
  // Validate Tenant Owner
  // ----------------------------------------------------

  if (tenantOwner) {
    if (!isValidObjectId(tenantOwner)) {
      throw new Error(
        "Invalid tenant owner ID."
      );
    }
  }

  // ----------------------------------------------------
  // Validate Business
  // ----------------------------------------------------

  if (businessId) {
    if (!isValidObjectId(businessId)) {
      throw new Error(
        "Invalid business ID."
      );
    }

    const business =
      await validateBusiness(
        businessId
      );

    if (!business) {
      throw new Error(
        "Business not found or inactive."
      );
    }
  }

  // ----------------------------------------------------
  // Validate Business Type
  // ----------------------------------------------------

  if (businessTypeId) {
    if (
      !isValidObjectId(
        businessTypeId
      )
    ) {
      throw new Error(
        "Invalid business type ID."
      );
    }

    const businessType =
      await BusinessType.findOne({
        _id: businessTypeId,

        ...(businessId
          ? {
              business: businessId,
            }
          : {}),

        isActive: true,
      });

    if (!businessType) {
      throw new Error(
        "Business type not found, inactive, or does not belong to the selected business."
      );
    }
  }

  // ----------------------------------------------------
  // Build Filter
  // ----------------------------------------------------

  const filter = {};

  if (tenantOwner) {
    filter.tenantOwner =
      tenantOwner;
  }

  if (businessId) {
    filter.business =
      businessId;
  }

  if (businessTypeId) {
    filter.businessType =
      businessTypeId;
  }

  return filter;
};

// ======================================================
// GET SALE TENANT QUERY
// ======================================================
//
// Admin:
//
// {
//   tenantOwner: Admin._id
// }
//
// Manager:
//
// {
//   tenantOwner: Admin._id
// }
//
// Super Admin:
//
// {
//   tenantOwner?: ...,
//   business?: ...,
//   businessType?: ...
// }
//
// ======================================================

const getSaleTenantQuery = async (req) => {
  const tenant =
    await getTenantContext(req);

  // ----------------------------------------------------
  // SUPER ADMIN
  // ----------------------------------------------------

  if (tenant.isSuperAdmin) {
    const filter =
      await getSuperAdminFilter(req);

    return filter;
  }

  // ----------------------------------------------------
  // ADMIN / MANAGER
  // ----------------------------------------------------

  if (!tenant.tenantOwner) {
    return null;
  }

  // IMPORTANT:
  //
  // tenantOwner is the real security boundary.
  //
  // business and businessType are additional
  // context filters.

  return buildTenantBusinessQuery(
    tenant
  );
};

// ======================================================
// GET SALE CREATE CONTEXT
// ======================================================
//
// Determines which tenant/business/businessType
// the new sale belongs to.
//
// Admin / Manager:
//     Taken ONLY from tenantContext.
//
// Super Admin:
//     Must explicitly provide tenantOwner,
//     business and businessType.
//
// ======================================================

const getSaleCreateContext = async (
  req
) => {
  const tenant =
    await getTenantContext(req);

  // ====================================================
  // SUPER ADMIN
  // ====================================================

  if (tenant.isSuperAdmin) {
    const tenantOwner =
      req.body?.tenantOwner ||
      req.query?.tenantOwner ||
      null;

    const businessId =
      req.body?.business ||
      req.query?.business ||
      null;

    const businessTypeId =
      req.body?.businessType ||
      req.query?.businessType ||
      null;

    if (!tenantOwner) {
      throw new Error(
        "Tenant owner is required when Super Admin creates a sale."
      );
    }

    if (!businessId) {
      throw new Error(
        "Business is required."
      );
    }

    if (!businessTypeId) {
      throw new Error(
        "Business type is required."
      );
    }

    if (
      !isValidObjectId(
        tenantOwner
      )
    ) {
      throw new Error(
        "Invalid tenant owner ID."
      );
    }

    if (
      !isValidObjectId(
        businessId
      )
    ) {
      throw new Error(
        "Invalid business ID."
      );
    }

    if (
      !isValidObjectId(
        businessTypeId
      )
    ) {
      throw new Error(
        "Invalid business type ID."
      );
    }

    return {
      tenant,
      tenantOwner,
      businessId,
      businessTypeId,
    };
  }

  // ====================================================
  // ADMIN / MANAGER
  // ====================================================

  const tenantOwner =
    tenant.tenantOwner;

  const businessId =
    tenant.business;

  const businessTypeId =
    tenant.businessType;

  if (!tenantOwner) {
    throw new Error(
      "No valid tenant is assigned to this user."
    );
  }

  if (!businessId) {
    throw new Error(
      "No valid business is assigned to this user."
    );
  }

  if (!businessTypeId) {
    throw new Error(
      "No valid business type is assigned to this user."
    );
  }

  return {
    tenant,
    tenantOwner,
    businessId,
    businessTypeId,
  };
};

// ======================================================
// GENERATE SALE NUMBER
// ======================================================
//
// Sale number is generated per tenant.
//
// Example:
//
// Admin A:
// SAL-000001
// SAL-000002
//
// Admin B:
// SAL-000001
// SAL-000002
//
// ======================================================

const generateSaleNumber = async (
  tenantOwner
) => {
  const latestSale =
    await Sale.findOne({
      tenantOwner,
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

// ======================================================
// CREATE SALE
// ======================================================

export const createSale = async (
  req,
  res,
  next
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
    } = req.body;

    // --------------------------------------------------
    // Get Tenant Context
    // --------------------------------------------------

    const {
      tenantOwner,
      businessId,
      businessTypeId,
    } = await getSaleCreateContext(
      req
    );

    // --------------------------------------------------
    // Validate Business
    // --------------------------------------------------

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

    // --------------------------------------------------
    // Validate Business Type
    // --------------------------------------------------

    const businessType =
      await validateBusinessType(
        businessTypeId,
        businessId
      );

    if (!businessType) {
      return errorResponse(
        res,
        404,
        "Business type not found, inactive, or does not belong to the selected business."
      );
    }

    // ==================================================
    // VALIDATE CUSTOMER
    // ==================================================

    let customerId = null;

    if (customer) {
      if (
        !isValidObjectId(
          customer
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid customer ID."
        );
      }

      // IMPORTANT:
      //
      // Customer must belong to:
      //
      // same tenantOwner
      // same business
      // same businessType
      //
      // This prevents cross-tenant customer usage.

      const customerDoc =
        await Customer.findOne({
          _id: customer,
          tenantOwner,
          business: businessId,
          businessType:
            businessTypeId,
          isActive: true,
        });

      if (!customerDoc) {
        return errorResponse(
          res,
          404,
          "Customer not found in this tenant, business, or business type."
        );
      }

      customerId =
        customerDoc._id;
    }

    // ==================================================
    // VALIDATE AMOUNTS
    // ==================================================

    if (
      Number(paidAmount) >
      Number(totalAmount)
    ) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be greater than total amount."
      );
    }

    if (
      Number(totalAmount) < 0 ||
      Number(paidAmount) < 0
    ) {
      return errorResponse(
        res,
        400,
        "Sale amounts cannot be negative."
      );
    }

    // --------------------------------------------------
    // Due Amount
    // --------------------------------------------------

    const calculatedDueAmount =
      Math.max(
        Number(totalAmount) -
          Number(paidAmount),
        0
      );

    // ==================================================
    // PAYMENT STATUS
    // ==================================================

    let paymentStatus =
      "unpaid";

    if (
      Number(totalAmount) === 0
    ) {
      paymentStatus =
        "paid";
    } else if (
      Number(paidAmount) === 0
    ) {
      paymentStatus =
        "unpaid";
    } else if (
      Number(paidAmount) <
      Number(totalAmount)
    ) {
      paymentStatus =
        "partially_paid";
    } else {
      paymentStatus =
        "paid";
    }

    // ==================================================
    // SALE NUMBER
    // ==================================================

    const finalSaleNumber =
      saleNumber?.toString().trim()
        .toUpperCase() ||
      (await generateSaleNumber(
        tenantOwner
      ));

    // ==================================================
    // DUPLICATE SALE NUMBER
    // ==================================================

    const existingSale =
      await Sale.findOne({
        tenantOwner,
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

    // ==================================================
    // CREATE SALE
    // ==================================================

    const sale =
      await Sale.create({
        tenantOwner,

        business:
          businessId,

        businessType:
          businessTypeId,

        customer:
          customerId,

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

      

        createdBy:
          req.user._id,
      });

    // ==================================================
    // POPULATE RESPONSE
    // ==================================================

    const populatedSale =
      await Sale.findById(
        sale._id
      )
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
          "name business"
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

    // Duplicate unique index
    if (
      error?.code === 11000
    ) {
      return errorResponse(
        res,
        409,
        "Sale number already exists."
      );
    }

    next(error);
  }
};

// ======================================================
// GET ALL SALES
// ======================================================

export const getAllSales = async (
  req,
  res,
  next
) => {
  try {
    // --------------------------------------------------
    // Tenant Query
    // --------------------------------------------------

    const tenantQuery =
      await getSaleTenantQuery(
        req
      );

    if (!tenantQuery) {
      return errorResponse(
        res,
        400,
        "No valid tenant is assigned to this user."
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

    // ==================================================
    // PAGINATION
    // ==================================================

    const currentPage =
      Math.max(
        Number(page) || 1,
        1
      );

    const currentLimit =
      Math.min(
        Math.max(
          Number(limit) || 20,
          1
        ),
        100
      );

    const skip =
      (currentPage - 1) *
      currentLimit;

    // ==================================================
    // BASE QUERY
    // ==================================================

    const filter = {
      ...tenantQuery,
    };

    // ==================================================
    // SEARCH
    // ==================================================

    if (search?.trim()) {
      const escapedSearch =
        search
          .trim()
          .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

      const searchRegex =
        new RegExp(
          escapedSearch,
          "i"
        );

      filter.$or = [
        {
          saleNumber:
            searchRegex,
        },
        {
          referenceNumber:
            searchRegex,
        },
      ];
    }

    // ==================================================
    // CUSTOMER FILTER
    // ==================================================

    if (customer) {
      if (
        !isValidObjectId(
          customer
        )
      ) {
        return errorResponse(
          res,
          400,
          "Invalid customer ID."
        );
      }

      // For Admin / Manager, verify customer
      // belongs to their tenant.
      //
      // For Super Admin, the tenantQuery may already
      // contain tenantOwner/business/businessType.

      const customerQuery = {
        _id: customer,
        isActive: true,
      };

      if (
        tenantQuery.tenantOwner
      ) {
        customerQuery.tenantOwner =
          tenantQuery.tenantOwner;
      }

      if (
        tenantQuery.business
      ) {
        customerQuery.business =
          tenantQuery.business;
      }

      if (
        tenantQuery.businessType
      ) {
        customerQuery.businessType =
          tenantQuery.businessType;
      }

      const customerDoc =
        await Customer.findOne(
          customerQuery
        ).select("_id");

      if (!customerDoc) {
        return errorResponse(
          res,
          404,
          "Customer not found in the selected tenant."
        );
      }

      filter.customer =
        customer;
    }

    // ==================================================
    // STATUS
    // ==================================================

    if (status) {
      filter.status =
        status;
    }

    // ==================================================
    // PAYMENT STATUS
    // ==================================================

    if (paymentStatus) {
      filter.paymentStatus =
        paymentStatus;
    }

    // ==================================================
    // PAYMENT METHOD
    // ==================================================

    if (paymentMethod) {
      filter.paymentMethod =
        paymentMethod;
    }

    // ==================================================
    // DATE RANGE
    // ==================================================

    if (
      startDate ||
      endDate
    ) {
      filter.saleDate = {};

      if (startDate) {
        const start =
          new Date(startDate);

        if (
          Number.isNaN(
            start.getTime()
          )
        ) {
          return errorResponse(
            res,
            400,
            "Invalid start date."
          );
        }

        filter.saleDate.$gte =
          start;
      }

      if (endDate) {
        const end =
          new Date(endDate);

        if (
          Number.isNaN(
            end.getTime()
          )
        ) {
          return errorResponse(
            res,
            400,
            "Invalid end date."
          );
        }

        end.setHours(
          23,
          59,
          59,
          999
        );

        filter.saleDate.$lte =
          end;
      }
    }

    // ==================================================
    // FETCH SALES
    // ==================================================

    const [
      sales,
      total,
    ] = await Promise.all([
      Sale.find(filter)
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
          "name business"
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
        )
        .sort({
          saleDate: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(currentLimit)
        .lean(),

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

          page:
            currentPage,

          limit:
            currentLimit,

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

    next(error);
  }
};

// ======================================================
// GET SALE BY ID
// ======================================================

export const getSaleById = async (
  req,
  res,
  next
) => {
  try {
    const { id } =
      req.params;

    // --------------------------------------------------
    // Validate ID
    // --------------------------------------------------

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    // --------------------------------------------------
    // Tenant Query
    // --------------------------------------------------

    const tenantQuery =
      await getSaleTenantQuery(
        req
      );

    if (!tenantQuery) {
      return errorResponse(
        res,
        400,
        "No valid tenant is assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find Sale
    // --------------------------------------------------

    const sale =
      await Sale.findOne({
        _id: id,
        ...tenantQuery,
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
          "name business"
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

    next(error);
  }
};

// ======================================================
// UPDATE SALE
// ======================================================

export const updateSale = async (
  req,
  res,
  next
) => {
  try {
    const { id } =
      req.params;

    // --------------------------------------------------
    // Validate ID
    // --------------------------------------------------

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    // --------------------------------------------------
    // Tenant Query
    // --------------------------------------------------

    const tenantQuery =
      await getSaleTenantQuery(
        req
      );

    if (!tenantQuery) {
      return errorResponse(
        res,
        400,
        "No valid tenant is assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find Sale With Tenant Ownership
    // --------------------------------------------------

    const sale =
      await Sale.findOne({
        _id: id,
        ...tenantQuery,
      });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    // ==================================================
    // PREVENT EDITING COMPLETED / RETURNED SALES
    // ==================================================

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

    // ==================================================
    // CUSTOMER
    // ==================================================

    if (
      req.body.customer !==
      undefined
    ) {
      // ------------------------------------------------
      // Walk-in customer
      // ------------------------------------------------

      if (
        req.body.customer ===
        null ||
        req.body.customer ===
        ""
      ) {
        sale.customer =
          null;
      } else {
        // ------------------------------------------------
        // Validate Customer ID
        // ------------------------------------------------

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

        // ------------------------------------------------
        // Customer must belong to same tenant
        // ------------------------------------------------

        const customer =
          await Customer.findOne({
            _id:
              req.body.customer,

            tenantOwner:
              sale.tenantOwner,

            business:
              sale.business,

            businessType:
              sale.businessType,

            isActive: true,
          });

        if (!customer) {
          return errorResponse(
            res,
            404,
            "Customer not found in this tenant, business, or business type."
          );
        }

        sale.customer =
          customer._id;
      }
    }

    // ==================================================
    // SALE NUMBER
    // ==================================================

    if (
      req.body.saleNumber !==
      undefined
    ) {
      const newSaleNumber =
        req.body.saleNumber
          ?.toString()
          .trim()
          .toUpperCase();

      if (!newSaleNumber) {
        return errorResponse(
          res,
          400,
          "Sale number cannot be empty."
        );
      }

      if (
        newSaleNumber !==
        sale.saleNumber
      ) {
        const duplicateSale =
          await Sale.findOne({
            _id: {
              $ne: sale._id,
            },

            tenantOwner:
              sale.tenantOwner,

            saleNumber:
              newSaleNumber,
          });

        if (duplicateSale) {
          return errorResponse(
            res,
            409,
            "Sale number already exists."
          );
        }

        sale.saleNumber =
          newSaleNumber;
      }
    }

    // ==================================================
    // ALLOWED FIELDS
    // ==================================================
    //
    // tenantOwner
    // business
    // businessType
    // customer handled separately
    // createdBy
    //
    // are NOT allowed here.
    //
    // This prevents tenant reassignment.
    // ==================================================

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
    ];

    for (
      const field of allowedFields
    ) {
      if (
        req.body[field] !==
        undefined
      ) {
        if (
          typeof req.body[field] ===
          "string"
        ) {
          sale[field] =
            req.body[field].trim();
        } else {
          sale[field] =
            req.body[field];
        }
      }
    }

    // ==================================================
    // VALIDATE PAYMENT AMOUNTS
    // ==================================================

    if (
      Number(sale.totalAmount) <
      0
    ) {
      return errorResponse(
        res,
        400,
        "Total amount cannot be negative."
      );
    }

    if (
      Number(sale.paidAmount) <
      0
    ) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be negative."
      );
    }

    if (
      Number(sale.paidAmount) >
      Number(sale.totalAmount)
    ) {
      return errorResponse(
        res,
        400,
        "Paid amount cannot be greater than total amount."
      );
    }

    // ==================================================
    // RECALCULATE DUE AMOUNT
    // ==================================================

    sale.dueAmount =
      Math.max(
        Number(sale.totalAmount) -
          Number(sale.paidAmount),
        0
      );

    // ==================================================
    // RECALCULATE PAYMENT STATUS
    // ==================================================

    if (
      Number(sale.totalAmount) ===
      0
    ) {
      sale.paymentStatus =
        "paid";
    } else if (
      Number(sale.paidAmount) ===
      0
    ) {
      sale.paymentStatus =
        "unpaid";
    } else if (
      Number(sale.paidAmount) <
      Number(sale.totalAmount)
    ) {
      sale.paymentStatus =
        "partially_paid";
    } else {
      sale.paymentStatus =
        "paid";
    }

    // ==================================================
    // AUDIT
    // ==================================================

    sale.updatedBy =
      req.user._id;

    await sale.save();

    // ==================================================
    // POPULATE RESPONSE
    // ==================================================

    const updatedSale =
      await Sale.findById(
        sale._id
      )
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
          "name business"
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

    if (
      error?.code === 11000
    ) {
      return errorResponse(
        res,
        409,
        "Sale number already exists."
      );
    }

    next(error);
  }
};

// ======================================================
// CANCEL SALE
// ======================================================

export const cancelSale = async (
  req,
  res,
  next
) => {
  try {
    const { id } =
      req.params;

    // --------------------------------------------------
    // Validate ID
    // --------------------------------------------------

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    // --------------------------------------------------
    // Tenant Query
    // --------------------------------------------------

    const tenantQuery =
      await getSaleTenantQuery(
        req
      );

    if (!tenantQuery) {
      return errorResponse(
        res,
        400,
        "No valid tenant is assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find Sale With Tenant
    // --------------------------------------------------

    const sale =
      await Sale.findOne({
        _id: id,
        ...tenantQuery,
      });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    // ==================================================
    // ALREADY CANCELLED
    // ==================================================

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

    // ==================================================
    // COMPLETED SALES
    // ==================================================

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

    // ==================================================
    // RESTORE STOCK FOR ALL ITEMS
    // ==================================================
    //
    // Stock was already deducted when SaleItems were
    // created / updated. On cancel we must put it back.
    //
    // ==================================================

    const items = await SaleItem.find({
      sale: sale._id,
      tenantOwner: sale.tenantOwner,
      business: sale.business,
      businessType: sale.businessType,
    });

    for (const item of items) {
      await ProductInventory.findOneAndUpdate(
        {
          _id: item.productInventory,
          tenantOwner: sale.tenantOwner,
          business: sale.business,
          businessType: sale.businessType,
          isActive: true,
        },
        {
          $inc: { quantity: item.quantity },
          $set: { updatedBy: req.user._id },
        }
      );
    }

    // ==================================================
    // CANCEL
    // ==================================================

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

    next(error);
  }
};

// ======================================================
// RESTORE SALE
// ======================================================

export const restoreSale = async (
  req,
  res,
  next
) => {
  try {
    const { id } =
      req.params;

    // --------------------------------------------------
    // Validate ID
    // --------------------------------------------------

    if (
      !isValidObjectId(id)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid sale ID."
      );
    }

    // --------------------------------------------------
    // Tenant Query
    // --------------------------------------------------

    const tenantQuery =
      await getSaleTenantQuery(
        req
      );

    if (!tenantQuery) {
      return errorResponse(
        res,
        400,
        "No valid tenant is assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find Sale With Tenant
    // --------------------------------------------------

    const sale =
      await Sale.findOne({
        _id: id,
        ...tenantQuery,
      });

    if (!sale) {
      return errorResponse(
        res,
        404,
        "Sale not found."
      );
    }

    // ==================================================
    // ONLY CANCELLED SALES
    // ==================================================

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

    // ==================================================
    // RESTORE
    // ==================================================

    sale.status =
      "draft";

    sale.updatedBy =
      req.user._id;

    await sale.save();

    // ==================================================
    // POPULATE RESPONSE
    // ==================================================

    const restoredSale =
      await Sale.findById(
        sale._id
      )
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
          "name business"
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
      "Sale restored successfully.",
      restoredSale
    );
  } catch (error) {
    console.error(
      "Restore sale error:",
      error
    );

    next(error);
  }
};