import Brand from "../models/Brand.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";
import User from "../models/User.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// HELPERS
// =====================================================

const getRoleSlug = (req) => {
  return req.user?.role?.slug || req.user?.role;
};

const isSuperAdmin = (req) => {
  return getRoleSlug(req) === "super-admin";
};

const isAdmin = (req) => {
  return getRoleSlug(req) === "admin";
};

// =====================================================
// GET BUSINESS CONTEXT
// =====================================================
//
// Admin:
// business/businessType always come from req.user.
//
// Super Admin:
// business/businessType may be supplied in the request.
//
// =====================================================

const getBusinessContext = async (req, businessId, businessTypeId) => {
  const role = getRoleSlug(req);

  if (role === "admin") {
    if (!req.user.business) {
      throw new Error("Admin is not assigned to a business");
    }

    if (!req.user.businessType) {
      throw new Error("Admin is not assigned to a business type");
    }

    return {
      businessId: req.user.business,
      businessTypeId: req.user.businessType,
    };
  }

  if (role === "super-admin") {
    if (!businessId || !businessTypeId) {
      throw new Error(
        "Business and business type are required for Super Admin"
      );
    }

    return {
      businessId,
      businessTypeId,
    };
  }

  throw new Error("You are not authorized to manage brands");
};

// =====================================================
// VALIDATE BUSINESS + BUSINESS TYPE
// =====================================================

const validateBusinessContext = async (
  businessId,
  businessTypeId
) => {
  const business = await Business.findOne({
    _id: businessId,
    isActive: true,
  });

  if (!business) {
    return {
      error: {
        status: 404,
        message: "Business not found or inactive",
      },
    };
  }

  const businessType = await BusinessType.findOne({
    _id: businessTypeId,
    business: businessId,
    isActive: true,
  });

  if (!businessType) {
    return {
      error: {
        status: 404,
        message:
          "Business type not found, inactive, or does not belong to this business",
      },
    };
  }

  return {
    business,
    businessType,
  };
};

// =====================================================
// POPULATE BRAND
// =====================================================

const populateBrand = (query) => {
  return query
    .populate({
      path: "business",
      select: "name",
    })
    .populate({
      path: "businessType",
      select: "name business",
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
// CREATE BRAND
// =====================================================

export const createBrand = async (req, res, next) => {
  try {
    const {
      name,
      description,
      isActive,
      business,
      businessType,
    } = req.body;

    if (!name?.trim()) {
      return errorResponse(
        res,
        400,
        "Brand name is required"
      );
    }

    const context = await getBusinessContext(
      req,
      business,
      businessType
    );

    const {
      businessId,
      businessTypeId,
    } = context;

    // -------------------------------------------------
    // VALIDATE BUSINESS + BUSINESS TYPE
    // -------------------------------------------------

    const validation = await validateBusinessContext(
      businessId,
      businessTypeId
    );

    if (validation.error) {
      return errorResponse(
        res,
        validation.error.status,
        validation.error.message
      );
    }

    // -------------------------------------------------
    // CHECK DUPLICATE
    // -------------------------------------------------

    const trimmedName = name.trim();

    const existingBrand = await Brand.findOne({
      business: businessId,
      name: trimmedName,
    });

    if (existingBrand) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in your business"
      );
    }

    // -------------------------------------------------
    // CREATE
    // -------------------------------------------------

    const brand = await Brand.create({
      business: businessId,
      businessType: businessTypeId,
      createdBy: req.user._id,
      name: trimmedName,
      description: description?.trim() || "",
      isActive:
        isActive !== undefined
          ? Boolean(isActive)
          : true,
    });

    const populatedBrand = await populateBrand(
      Brand.findById(brand._id)
    );

    return successResponse(
      res,
      201,
      "Brand created successfully",
      populatedBrand
    );
  } catch (error) {
    // Mongo duplicate key protection
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in your business"
      );
    }

    next(error);
  }
};

// =====================================================
// GET ALL BRANDS
// =====================================================
//
// Admin:
// ONLY his business.
//
// Super Admin:
// Can optionally filter by business.
//
// =====================================================

export const getAllBrands = async (req, res, next) => {
  try {
    const { business, businessType, search } = req.query;

    const filter = {};

    // -------------------------------------------------
    // ADMIN ISOLATION
    // -------------------------------------------------

    if (isAdmin(req)) {
      if (!req.user.business) {
        return errorResponse(
          res,
          400,
          "Admin is not assigned to a business"
        );
      }

      filter.business = req.user.business;

      if (req.user.businessType) {
        filter.businessType = req.user.businessType;
      }
    }

    // -------------------------------------------------
    // SUPER ADMIN FILTER
    // -------------------------------------------------

    if (isSuperAdmin(req)) {
      if (business) {
        filter.business = business;
      }

      if (businessType) {
        filter.businessType = businessType;
      }
    }

    // -------------------------------------------------
    // SEARCH
    // -------------------------------------------------

    if (search?.trim()) {
      filter.name = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    const brands = await populateBrand(
      Brand.find(filter)
    ).sort({ name: 1 });

    return successResponse(
      res,
      200,
      "Brands fetched successfully",
      brands
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BRANDS BY BUSINESS TYPE
// =====================================================

export const getBrandsByBusinessType = async (
  req,
  res,
  next
) => {
  try {
    const { businessTypeId } = req.params;

    if (!businessTypeId) {
      return errorResponse(
        res,
        400,
        "Business type ID is required"
      );
    }

    // -------------------------------------------------
    // ADMIN
    // -------------------------------------------------

    if (isAdmin(req)) {
      if (!req.user.business) {
        return errorResponse(
          res,
          400,
          "Admin is not assigned to a business"
        );
      }

      if (
        req.user.businessType?.toString() !==
        businessTypeId.toString()
      ) {
        return errorResponse(
          res,
          403,
          "You cannot access brands from another business type"
        );
      }

      const businessType = await BusinessType.findOne({
        _id: businessTypeId,
        business: req.user.business,
        isActive: true,
      });

      if (!businessType) {
        return errorResponse(
          res,
          404,
          "Business type not found"
        );
      }

      const brands = await populateBrand(
        Brand.find({
          business: req.user.business,
          businessType: businessTypeId,
          isActive: true,
        })
      ).sort({ name: 1 });

      return successResponse(
        res,
        200,
        "Brands fetched successfully",
        brands
      );
    }

    // -------------------------------------------------
    // SUPER ADMIN
    // -------------------------------------------------

    if (isSuperAdmin(req)) {
      const businessType = await BusinessType.findById(
        businessTypeId
      );

      if (!businessType) {
        return errorResponse(
          res,
          404,
          "Business type not found"
        );
      }

      if (!businessType.isActive) {
        return errorResponse(
          res,
          400,
          "Business type is inactive"
        );
      }

      const brands = await populateBrand(
        Brand.find({
          business: businessType.business,
          businessType: businessTypeId,
          isActive: true,
        })
      ).sort({ name: 1 });

      return successResponse(
        res,
        200,
        "Brands fetched successfully",
        brands
      );
    }

    return errorResponse(
      res,
      403,
      "You are not authorized to access brands"
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BRAND BY ID
// =====================================================

export const getBrandById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const filter = {
      _id: id,
    };

    // -------------------------------------------------
    // ADMIN ISOLATION
    // -------------------------------------------------

    if (isAdmin(req)) {
      filter.business = req.user.business;

      if (req.user.businessType) {
        filter.businessType = req.user.businessType;
      }
    }

    const brand = await populateBrand(
      Brand.findOne(filter)
    );

    if (!brand) {
      return errorResponse(
        res,
        404,
        "Brand not found"
      );
    }

    return successResponse(
      res,
      200,
      "Brand fetched successfully",
      brand
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE BRAND
// =====================================================

export const updateBrand = async (req, res, next) => {
  try {
    const { id } = req.params;

    const {
      name,
      description,
      isActive,
      businessType,
      business,
    } = req.body;

    // -------------------------------------------------
    // FIND WITH TENANT FILTER
    // -------------------------------------------------

    const filter = {
      _id: id,
    };

    if (isAdmin(req)) {
      filter.business = req.user.business;
      filter.businessType = req.user.businessType;
    } else if (!isSuperAdmin(req)) {
      return errorResponse(
        res,
        403,
        "You are not authorized to update brands"
      );
    }

    const brand = await Brand.findOne(filter);

    if (!brand) {
      return errorResponse(
        res,
        404,
        "Brand not found"
      );
    }

    // -------------------------------------------------
    // ADMIN CANNOT CHANGE BUSINESS OWNERSHIP
    // -------------------------------------------------

    if (isAdmin(req)) {
      if (
        business !== undefined ||
        businessType !== undefined
      ) {
        return errorResponse(
          res,
          403,
          "You cannot change the business or business type of a brand"
        );
      }
    }

    // -------------------------------------------------
    // SUPER ADMIN
    // -------------------------------------------------

    let finalBusiness = brand.business;
    let finalBusinessType = brand.businessType;

    if (isSuperAdmin(req)) {
      if (business !== undefined) {
        finalBusiness = business;
      }

      if (businessType !== undefined) {
        finalBusinessType = businessType;
      }

      const validation = await validateBusinessContext(
        finalBusiness,
        finalBusinessType
      );

      if (validation.error) {
        return errorResponse(
          res,
          validation.error.status,
          validation.error.message
        );
      }
    }

    // -------------------------------------------------
    // NAME
    // -------------------------------------------------

    const finalName =
      name !== undefined
        ? name.trim()
        : brand.name;

    if (!finalName) {
      return errorResponse(
        res,
        400,
        "Brand name cannot be empty"
      );
    }

    // -------------------------------------------------
    // DUPLICATE
    // -------------------------------------------------

    const duplicateBrand = await Brand.findOne({
      _id: { $ne: brand._id },
      business: finalBusiness,
      name: finalName,
    });

    if (duplicateBrand) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in this business"
      );
    }

    // -------------------------------------------------
    // UPDATE
    // -------------------------------------------------

    brand.name = finalName;

    if (description !== undefined) {
      brand.description = description.trim();
    }

    if (isActive !== undefined) {
      brand.isActive = Boolean(isActive);
    }

    if (isSuperAdmin(req)) {
      brand.business = finalBusiness;
      brand.businessType = finalBusinessType;
    }

    brand.updatedBy = req.user._id;

    await brand.save();

    const populatedBrand = await populateBrand(
      Brand.findById(brand._id)
    );

    return successResponse(
      res,
      200,
      "Brand updated successfully",
      populatedBrand
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in this business"
      );
    }

    next(error);
  }
};

// =====================================================
// DELETE BRAND
// =====================================================

export const deleteBrand = async (req, res, next) => {
  try {
    const { id } = req.params;

    const filter = {
      _id: id,
    };

    // -------------------------------------------------
    // ADMIN ISOLATION
    // -------------------------------------------------

    if (isAdmin(req)) {
      filter.business = req.user.business;
      filter.businessType = req.user.businessType;
    } else if (!isSuperAdmin(req)) {
      return errorResponse(
        res,
        403,
        "You are not authorized to delete brands"
      );
    }

    const brand = await Brand.findOne(filter);

    if (!brand) {
      return errorResponse(
        res,
        404,
        "Brand not found"
      );
    }

    // -------------------------------------------------
    // DELETE
    // -------------------------------------------------

    await Brand.findByIdAndDelete(brand._id);

    return successResponse(
      res,
      200,
      "Brand deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};