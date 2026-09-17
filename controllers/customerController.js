import mongoose from "mongoose";

import Customer from "../models/Customer.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

// ======================================================
// HELPERS
// ======================================================

const getUserRole = (req) => {
  return (
    req.user?.role?.slug ||
    req.user?.role?.name ||
    ""
  )
    .toString()
    .trim()
    .toLowerCase();
};

const isSuperAdmin = (req) => {
  return getUserRole(req) === "super-admin";
};

const isManager = (req) => {
  return getUserRole(req) === "manager";
};

const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// ======================================================
// GET EFFECTIVE TENANT CONTEXT
// ======================================================
//
// Super Admin:
//   No tenant restriction.
//
// Admin:
//   req.user.business
//   req.user.businessType
//
// Manager:
//   Gets business/businessType from the Admin who
//   created the Manager.
//
// Returns:
// {
//   business,
//   businessType
// }
//
// or null if the normal user has no valid context.
// ======================================================

const getEffectiveContext = async (user) => {
  if (!user) {
    return null;
  }

  // ----------------------------------------------------
  // Super Admin
  // ----------------------------------------------------

  const role =
    user?.role?.slug ||
    user?.role?.name ||
    "";

  const normalizedRole = role
    .toString()
    .trim()
    .toLowerCase();

  if (normalizedRole === "super-admin") {
    return null;
  }

  // ----------------------------------------------------
  // Direct Business + BusinessType
  // ----------------------------------------------------

  if (
    user.business &&
    user.businessType
  ) {
    return {
      business:
        user.business?._id ||
        user.business,

      businessType:
        user.businessType?._id ||
        user.businessType,
    };
  }

  // ----------------------------------------------------
  // Manager
  // ----------------------------------------------------
  //
  // If Manager does not directly have business /
  // businessType, get them from the creator.
  //
  // ----------------------------------------------------

  if (
    normalizedRole === "manager" &&
    user.createdBy
  ) {
    const creator =
      await mongoose.model("User")
        .findById(
          user.createdBy?._id ||
            user.createdBy
        )
        .select("business businessType");

    if (
      creator?.business &&
      creator?.businessType
    ) {
      return {
        business:
          creator.business?._id ||
          creator.business,

        businessType:
          creator.businessType?._id ||
          creator.businessType,
      };
    }
  }

  return null;
};

// ======================================================
// VALIDATE BUSINESS
// ======================================================

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

// ======================================================
// VALIDATE BUSINESS TYPE
// ======================================================
//
// Important:
//
// BusinessType must belong to the selected Business.
//
// This prevents:
//
// Business A + BusinessType from Business B
//
// ======================================================

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
// GET SUPER ADMIN FILTER CONTEXT
// ======================================================
//
// Super Admin can optionally use:
//
// ?business=...
// ?businessType=...
//
// Normal Admin/Manager never use these query/body
// values for tenant selection.
// ======================================================

const getSuperAdminContext = async (req) => {
  if (!isSuperAdmin(req)) {
    return null;
  }

  const businessId =
    req.body?.business ||
    req.query?.business ||
    null;

  const businessTypeId =
    req.body?.businessType ||
    req.query?.businessType ||
    null;

  // ----------------------------------------------------
  // No filter
  // ----------------------------------------------------

  if (!businessId && !businessTypeId) {
    return {};
  }

  // ----------------------------------------------------
  // Business validation
  // ----------------------------------------------------

  if (
    businessId &&
    !isValidObjectId(businessId)
  ) {
    throw new Error(
      "Invalid business ID."
    );
  }

  if (
    businessTypeId &&
    !isValidObjectId(businessTypeId)
  ) {
    throw new Error(
      "Invalid business type ID."
    );
  }

  // ----------------------------------------------------
  // If business is supplied
  // ----------------------------------------------------

  if (businessId) {
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
  // If BusinessType is supplied
  // ----------------------------------------------------

  if (businessTypeId) {
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

  const context = {};

  if (businessId) {
    context.business = businessId;
  }

  if (businessTypeId) {
    context.businessType =
      businessTypeId;
  }

  return context;
};

// ======================================================
// GET TENANT QUERY
// ======================================================
//
// Admin / Manager:
//
// {
//   business,
//   businessType
// }
//
// Super Admin:
//
// optional filters.
//
// ======================================================

const getTenantQuery = async (req) => {
  // ----------------------------------------------------
  // Super Admin
  // ----------------------------------------------------

  if (isSuperAdmin(req)) {
    return await getSuperAdminContext(
      req
    );
  }

  // ----------------------------------------------------
  // Admin / Manager
  // ----------------------------------------------------

  const context =
    await getEffectiveContext(
      req.user
    );

  if (
    !context?.business ||
    !context?.businessType
  ) {
    return null;
  }

  if (
    !isValidObjectId(
      context.business
    ) ||
    !isValidObjectId(
      context.businessType
    )
  ) {
    return null;
  }

  return {
    business: context.business,
    businessType:
      context.businessType,
  };
};

// ======================================================
// CREATE CUSTOMER
// ======================================================

export const createCustomer = async (
  req,
  res,
  next
) => {
  try {
    const {
      name,
      phone,
      alternatePhone,
      email,
      address,
      city,
      country,
      openingBalance,
      creditLimit,
      isActive,
      notes,
    } = req.body;

    // --------------------------------------------------
    // Validate name
    // --------------------------------------------------

    if (
      !name ||
      !name.trim()
    ) {
      return errorResponse(
        res,
        400,
        "Customer name is required."
      );
    }

    // --------------------------------------------------
    // Get tenant context
    // --------------------------------------------------

    let businessId;
    let businessTypeId;

    if (isSuperAdmin(req)) {
      // -----------------------------------------------
      // Super Admin may explicitly select tenant
      // -----------------------------------------------

      businessId =
        req.body.business ||
        req.query.business ||
        null;

      businessTypeId =
        req.body.businessType ||
        req.query.businessType ||
        null;

      if (!businessId) {
        return errorResponse(
          res,
          400,
          "Business is required."
        );
      }

      if (!businessTypeId) {
        return errorResponse(
          res,
          400,
          "Business type is required."
        );
      }
    } else {
      // -----------------------------------------------
      // Admin / Manager
      //
      // NEVER trust req.body.business or
      // req.body.businessType.
      // -----------------------------------------------

      const context =
        await getEffectiveContext(
          req.user
        );

      if (
        !context?.business ||
        !context?.businessType
      ) {
        return errorResponse(
          res,
          400,
          "No valid business and business type are assigned to this user."
        );
      }

      businessId =
        context.business;

      businessTypeId =
        context.businessType;
    }

    // --------------------------------------------------
    // Validate IDs
    // --------------------------------------------------

    if (
      !isValidObjectId(businessId)
    ) {
      return errorResponse(
        res,
        400,
        "Invalid business ID."
      );
    }

    if (
      !isValidObjectId(
        businessTypeId
      )
    ) {
      return errorResponse(
        res,
        400,
        "Invalid business type ID."
      );
    }

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
    // Validate BusinessType
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

    // --------------------------------------------------
    // Check Duplicate Customer
    //
    // Duplicate is checked inside the same
    // Business + BusinessType tenant.
    // --------------------------------------------------

    const existingCustomer =
      await Customer.findOne({
        business: businessId,
        businessType: businessTypeId,
        name: name.trim(),
      });

    if (existingCustomer) {
      return errorResponse(
        res,
        409,
        "A customer with this name already exists in this business type."
      );
    }

    // --------------------------------------------------
    // Create Customer
    //
    // IMPORTANT:
    //
    // business and businessType come from the
    // authenticated context for Admin/Manager.
    //
    // req.body values are NOT trusted.
    // --------------------------------------------------

    const customer =
      await Customer.create({
        business: businessId,
        businessType: businessTypeId,

        name: name.trim(),

        phone:
          phone?.trim() || "",

        alternatePhone:
          alternatePhone?.trim() || "",

        email:
          email
            ?.trim()
            .toLowerCase() || "",

        address:
          address?.trim() || "",

        city:
          city?.trim() || "",

        country:
          country?.trim() ||
          "Pakistan",

        openingBalance:
          openingBalance ?? 0,

        creditLimit:
          creditLimit ?? 0,

        isActive:
          isActive ?? true,

        notes:
          notes?.trim() || "",

        createdBy:
          req.user._id,
      });

    // --------------------------------------------------
    // Populate Response
    // --------------------------------------------------

    await customer.populate([
      {
        path: "business",
        select: "name",
      },
      {
        path: "businessType",
        select: "name business",
      },
      {
        path: "createdBy",
        select: "name email",
      },
    ]);

    return successResponse(
      res,
      201,
      "Customer created successfully.",
      customer
    );
  } catch (error) {
    // --------------------------------------------------
    // Handle duplicate MongoDB index
    // --------------------------------------------------

    if (error?.code === 11000) {
      return errorResponse(
        res,
        409,
        "A customer with this name already exists in this business type."
      );
    }

    next(error);
  }
};

// ======================================================
// GET ALL CUSTOMERS
// ======================================================

export const getAllCustomers = async (
  req,
  res,
  next
) => {
  try {
    const {
      search,
      city,
      isActive,
      page = 1,
      limit = 20,
    } = req.query;

    // --------------------------------------------------
    // Build tenant query
    // --------------------------------------------------

    const tenantQuery =
      await getTenantQuery(req);

    // --------------------------------------------------
    // Normal user must have tenant context
    // --------------------------------------------------

    if (
      !isSuperAdmin(req) &&
      !tenantQuery
    ) {
      return errorResponse(
        res,
        400,
        "No valid business and business type are assigned to this user."
      );
    }

    // --------------------------------------------------
    // Build Query
    // --------------------------------------------------

    const query = {
      ...tenantQuery,
    };

    // --------------------------------------------------
    // Search
    // --------------------------------------------------

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

      query.$or = [
        {
          name: searchRegex,
        },
        {
          phone: searchRegex,
        },
        {
          alternatePhone:
            searchRegex,
        },
        {
          email: searchRegex,
        },
      ];
    }

    // --------------------------------------------------
    // City Filter
    // --------------------------------------------------

    if (city?.trim()) {
      const escapedCity =
        city
          .trim()
          .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

      query.city =
        new RegExp(
          `^${escapedCity}$`,
          "i"
        );
    }

    // --------------------------------------------------
    // Active Filter
    // --------------------------------------------------

    if (
      isActive !== undefined
    ) {
      query.isActive =
        isActive === "true";
    }

    // --------------------------------------------------
    // Pagination
    // --------------------------------------------------

    const pageNumber = Math.max(
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

    // --------------------------------------------------
    // Fetch Customers
    //
    // BOTH queries use the exact same tenant query.
    // Therefore count cannot leak another tenant's
    // records either.
    // --------------------------------------------------

    const [
      customers,
      total,
    ] = await Promise.all([
      Customer.find(query)
        .populate(
          "business",
          "name"
        )
        .populate(
          "businessType",
          "name business"
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
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber)
        .lean(),

      Customer.countDocuments(
        query
      ),
    ]);

    return successResponse(
      res,
      200,
      "Customers fetched successfully.",
      {
        customers,

        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(
            total /
              limitNumber
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET CUSTOMER BY ID
// ======================================================

export const getCustomerById = async (
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
        "Invalid customer ID."
      );
    }

    // --------------------------------------------------
    // Get tenant query
    // --------------------------------------------------

    const tenantQuery =
      await getTenantQuery(req);

    if (
      !isSuperAdmin(req) &&
      !tenantQuery
    ) {
      return errorResponse(
        res,
        400,
        "No valid business and business type are assigned to this user."
      );
    }

    // --------------------------------------------------
    // Build ownership query
    // --------------------------------------------------

    const query = {
      _id: id,
      ...tenantQuery,
    };

    // --------------------------------------------------
    // Find Customer
    //
    // Admin A requesting Admin B's ID:
    //
    // _id = B's ID
    // business = A's business
    // businessType = A's businessType
    //
    // Result = null
    // --------------------------------------------------

    const customer =
      await Customer.findOne(query)
        .populate(
          "business",
          "name"
        )
        .populate(
          "businessType",
          "name business"
        )
        .populate(
          "createdBy",
          "name email"
        )
        .populate(
          "updatedBy",
          "name email"
        );

    if (!customer) {
      return errorResponse(
        res,
        404,
        "Customer not found."
      );
    }

    return successResponse(
      res,
      200,
      "Customer fetched successfully.",
      customer
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// UPDATE CUSTOMER
// ======================================================

export const updateCustomer = async (
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
        "Invalid customer ID."
      );
    }

    // --------------------------------------------------
    // Get tenant query
    // --------------------------------------------------

    const tenantQuery =
      await getTenantQuery(req);

    if (
      !isSuperAdmin(req) &&
      !tenantQuery
    ) {
      return errorResponse(
        res,
        400,
        "No valid business and business type are assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find customer WITH tenant ownership
    // --------------------------------------------------

    const customer =
      await Customer.findOne({
        _id: id,
        ...tenantQuery,
      });

    if (!customer) {
      return errorResponse(
        res,
        404,
        "Customer not found."
      );
    }

    // --------------------------------------------------
    // Allowed Fields
    // --------------------------------------------------

    const allowedFields = [
      "name",
      "phone",
      "alternatePhone",
      "email",
      "address",
      "city",
      "country",
      "openingBalance",
      "creditLimit",
      "isActive",
      "notes",
    ];

    // --------------------------------------------------
    // NEVER allow normal users to change tenant
    // --------------------------------------------------
    //
    // These fields are intentionally NOT included
    // in allowedFields.
    //
    // Even if req.body contains:
    //
    // business: OTHER_ID
    // businessType: OTHER_ID
    //
    // they will be ignored.
    //
    // For Super Admin, existing tenant assignment
    // is also kept immutable during customer update.
    // Tenant reassignment should be a separate operation
    // if required in the future.
    // --------------------------------------------------

    // --------------------------------------------------
    // Check Duplicate Customer Name
    // --------------------------------------------------

    if (
      req.body.name !==
      undefined
    ) {
      const newName =
        req.body.name
          ?.toString()
          .trim();

      if (!newName) {
        return errorResponse(
          res,
          400,
          "Customer name cannot be empty."
        );
      }

      const duplicateCustomer =
        await Customer.findOne({
          _id: {
            $ne: id,
          },

          business:
            customer.business,

          businessType:
            customer.businessType,

          name: newName,
        });

      if (duplicateCustomer) {
        return errorResponse(
          res,
          409,
          "A customer with this name already exists in this business type."
        );
      }
    }

    // --------------------------------------------------
    // Update Allowed Fields
    // --------------------------------------------------

    for (const field of allowedFields) {
      if (
        req.body[field] !==
        undefined
      ) {
        if (
          typeof req.body[field] ===
          "string"
        ) {
          customer[field] =
            req.body[field].trim();
        } else {
          customer[field] =
            req.body[field];
        }
      }
    }

    // --------------------------------------------------
    // Normalize Email
    // --------------------------------------------------

    if (customer.email) {
      customer.email =
        customer.email
          .trim()
          .toLowerCase();
    }

    // --------------------------------------------------
    // Audit
    // --------------------------------------------------

    customer.updatedBy =
      req.user._id;

    await customer.save();

    // --------------------------------------------------
    // Populate Response
    // --------------------------------------------------

    await customer.populate([
      {
        path: "business",
        select: "name",
      },
      {
        path: "businessType",
        select: "name business",
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
      "Customer updated successfully.",
      customer
    );
  } catch (error) {
    // --------------------------------------------------
    // Duplicate index error
    // --------------------------------------------------

    if (error?.code === 11000) {
      return errorResponse(
        res,
        409,
        "A customer with this name already exists in this business type."
      );
    }

    next(error);
  }
};

// ======================================================
// DELETE CUSTOMER
// ======================================================

export const deleteCustomer = async (
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
        "Invalid customer ID."
      );
    }

    // --------------------------------------------------
    // Get tenant query
    // --------------------------------------------------

    const tenantQuery =
      await getTenantQuery(req);

    if (
      !isSuperAdmin(req) &&
      !tenantQuery
    ) {
      return errorResponse(
        res,
        400,
        "No valid business and business type are assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find customer WITH tenant ownership
    // --------------------------------------------------

    const customer =
      await Customer.findOne({
        _id: id,
        ...tenantQuery,
      });

    if (!customer) {
      return errorResponse(
        res,
        404,
        "Customer not found."
      );
    }

    // --------------------------------------------------
    // Soft Delete
    // --------------------------------------------------

    customer.isActive = false;

    customer.updatedBy =
      req.user._id;

    await customer.save();

    return successResponse(
      res,
      200,
      "Customer deleted successfully.",
      {
        customerId:
          customer._id,
      }
    );
  } catch (error) {
    next(error);
  }
};

// ======================================================
// RESTORE CUSTOMER
// ======================================================

export const restoreCustomer = async (
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
        "Invalid customer ID."
      );
    }

    // --------------------------------------------------
    // Get tenant query
    // --------------------------------------------------

    const tenantQuery =
      await getTenantQuery(req);

    if (
      !isSuperAdmin(req) &&
      !tenantQuery
    ) {
      return errorResponse(
        res,
        400,
        "No valid business and business type are assigned to this user."
      );
    }

    // --------------------------------------------------
    // Find customer WITH tenant ownership
    // --------------------------------------------------

    const customer =
      await Customer.findOne({
        _id: id,
        ...tenantQuery,
      });

    if (!customer) {
      return errorResponse(
        res,
        404,
        "Customer not found."
      );
    }

    // --------------------------------------------------
    // Restore
    // --------------------------------------------------

    customer.isActive = true;

    customer.updatedBy =
      req.user._id;

    await customer.save();

    // --------------------------------------------------
    // Populate Response
    // --------------------------------------------------

    await customer.populate([
      {
        path: "business",
        select: "name",
      },
      {
        path: "businessType",
        select: "name business",
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
      "Customer restored successfully.",
      customer
    );
  } catch (error) {
    next(error);
  }
};