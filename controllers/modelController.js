import Model from "../models/Model.js";
import Brand from "../models/Brand.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";

import {
  errorResponse,
  successResponse,
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

const getBusinessContext = async (
  req,
  businessId,
  businessTypeId
) => {
  const role = getRoleSlug(req);

  // -------------------------------------------------
  // ADMIN
  // -------------------------------------------------

  if (role === "admin") {
    if (!req.user.business) {
      throw new Error(
        "Admin is not assigned to a business"
      );
    }

    if (!req.user.businessType) {
      throw new Error(
        "Admin is not assigned to a business type"
      );
    }

    return {
      businessId: req.user.business,
      businessTypeId: req.user.businessType,
    };
  }

  // -------------------------------------------------
  // SUPER ADMIN
  // -------------------------------------------------

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

  throw new Error(
    "You are not authorized to manage models"
  );
};

// =====================================================
// VALIDATE BUSINESS
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
// POPULATE MODEL
// =====================================================

const populateModel = (query) => {
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
      path: "brand",
      select: "name business businessType",
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
// CREATE MODEL
// =====================================================

export const createModel = async (req, res, next) => {
  try {
    const {
      name,
      brand,
      description,
      isActive,
      business,
      businessType,
    } = req.body;

    if (!name?.trim()) {
      return errorResponse(
        res,
        400,
        "Model name is required"
      );
    }

    if (!brand) {
      return errorResponse(
        res,
        400,
        "Brand is required"
      );
    }

    // -------------------------------------------------
    // BUSINESS CONTEXT
    // -------------------------------------------------

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
    // VALIDATE BUSINESS
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
    // CHECK BRAND
    // -------------------------------------------------
    //
    // Brand MUST belong to:
    //
    // current Business
    // current BusinessType
    //
    // -------------------------------------------------

    const existingBrand = await Brand.findOne({
      _id: brand,
      business: businessId,
      businessType: businessTypeId,
      isActive: true,
    });

    if (!existingBrand) {
      return errorResponse(
        res,
        404,
        "Brand not found in your business"
      );
    }

    // -------------------------------------------------
    // DUPLICATE MODEL
    // -------------------------------------------------

    const trimmedName = name.trim();

    const existingModel = await Model.findOne({
      business: businessId,
      brand: existingBrand._id,
      name: trimmedName,
    });

    if (existingModel) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists under this brand in your business"
      );
    }

    // -------------------------------------------------
    // CREATE
    // -------------------------------------------------

    const model = await Model.create({
      business: businessId,
      businessType: businessTypeId,
      brand: existingBrand._id,
      createdBy: req.user._id,
      name: trimmedName,
      description: description?.trim() || "",
      isActive:
        isActive !== undefined
          ? Boolean(isActive)
          : true,
    });

    const populatedModel = await populateModel(
      Model.findById(model._id)
    );

    return successResponse(
      res,
      201,
      "Model created successfully",
      populatedModel
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists under this brand in your business"
      );
    }

    next(error);
  }
};

// =====================================================
// GET ALL MODELS
// =====================================================

export const getAllModels = async (req, res, next) => {
  try {
    const {
      business,
      businessType,
      brand,
      search,
    } = req.query;

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
    // SUPER ADMIN
    // -------------------------------------------------

    if (isSuperAdmin(req)) {
      if (business) {
        filter.business = business;
      }

      if (businessType) {
        filter.businessType = businessType;
      }

      if (brand) {
        filter.brand = brand;
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

    const models = await populateModel(
      Model.find(filter)
    ).sort({ name: 1 });

    return successResponse(
      res,
      200,
      "Models fetched successfully",
      models
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET MODELS BY BRAND
// =====================================================

export const getModelsByBrand = async (
  req,
  res,
  next
) => {
  try {
    const { brandId } = req.params;

    if (!brandId) {
      return errorResponse(
        res,
        400,
        "Brand ID is required"
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

      // -------------------------------------------------
      // BRAND MUST BELONG TO CURRENT BUSINESS
      // -------------------------------------------------

      const existingBrand = await Brand.findOne({
        _id: brandId,
        business: req.user.business,
        businessType: req.user.businessType,
        isActive: true,
      });

      if (!existingBrand) {
        return errorResponse(
          res,
          404,
          "Brand not found in your business"
        );
      }

      const models = await populateModel(
        Model.find({
          business: req.user.business,
          businessType: req.user.businessType,
          brand: existingBrand._id,
          isActive: true,
        })
      ).sort({ name: 1 });

      return successResponse(
        res,
        200,
        "Models fetched successfully",
        models
      );
    }

    // -------------------------------------------------
    // SUPER ADMIN
    // -------------------------------------------------

    if (isSuperAdmin(req)) {
      const existingBrand = await Brand.findById(
        brandId
      );

      if (!existingBrand) {
        return errorResponse(
          res,
          404,
          "Brand not found"
        );
      }

      if (!existingBrand.isActive) {
        return errorResponse(
          res,
          400,
          "Brand is inactive"
        );
      }

      const models = await populateModel(
        Model.find({
          business: existingBrand.business,
          businessType: existingBrand.businessType,
          brand: existingBrand._id,
          isActive: true,
        })
      ).sort({ name: 1 });

      return successResponse(
        res,
        200,
        "Models fetched successfully",
        models
      );
    }

    return errorResponse(
      res,
      403,
      "You are not authorized to access models"
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET MODEL BY ID
// =====================================================

export const getModelById = async (
  req,
  res,
  next
) => {
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
        "You are not authorized to access models"
      );
    }

    const model = await populateModel(
      Model.findOne(filter)
    );

    if (!model) {
      return errorResponse(
        res,
        404,
        "Model not found"
      );
    }

    return successResponse(
      res,
      200,
      "Model fetched successfully",
      model
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE MODEL
// =====================================================

export const updateModel = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const {
      name,
      brand,
      description,
      isActive,
      business,
      businessType,
    } = req.body;

    // -------------------------------------------------
    // FIND MODEL WITH TENANT FILTER
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
        "You are not authorized to update models"
      );
    }

    const model = await Model.findOne(filter);

    if (!model) {
      return errorResponse(
        res,
        404,
        "Model not found"
      );
    }

    // -------------------------------------------------
    // ADMIN CANNOT CHANGE TENANT
    // -------------------------------------------------

    if (isAdmin(req)) {
      if (
        business !== undefined ||
        businessType !== undefined
      ) {
        return errorResponse(
          res,
          403,
          "You cannot change the business or business type of a model"
        );
      }
    }

    // -------------------------------------------------
    // FINAL BUSINESS CONTEXT
    // -------------------------------------------------

    let finalBusiness = model.business;
    let finalBusinessType = model.businessType;

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
    // FINAL BRAND
    // -------------------------------------------------

    const finalBrandId =
      brand !== undefined
        ? brand
        : model.brand;

    // -------------------------------------------------
    // BRAND MUST BELONG TO SAME BUSINESS
    // -------------------------------------------------

    const existingBrand = await Brand.findOne({
      _id: finalBrandId,
      business: finalBusiness,
      businessType: finalBusinessType,
      isActive: true,
    });

    if (!existingBrand) {
      return errorResponse(
        res,
        404,
        "Selected brand does not belong to this business"
      );
    }

    // -------------------------------------------------
    // FINAL NAME
    // -------------------------------------------------

    const finalName =
      name !== undefined
        ? name.trim()
        : model.name;

    if (!finalName) {
      return errorResponse(
        res,
        400,
        "Model name cannot be empty"
      );
    }

    // -------------------------------------------------
    // DUPLICATE
    // -------------------------------------------------

    const duplicateModel = await Model.findOne({
      _id: { $ne: model._id },
      business: finalBusiness,
      brand: existingBrand._id,
      name: finalName,
    });

    if (duplicateModel) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists under this brand in this business"
      );
    }

    // -------------------------------------------------
    // UPDATE
    // -------------------------------------------------

    model.name = finalName;
    model.brand = existingBrand._id;

    if (description !== undefined) {
      model.description = description.trim();
    }

    if (isActive !== undefined) {
      model.isActive = Boolean(isActive);
    }

    if (isSuperAdmin(req)) {
      model.business = finalBusiness;
      model.businessType = finalBusinessType;
    }

    model.updatedBy = req.user._id;

    await model.save();

    const populatedModel = await populateModel(
      Model.findById(model._id)
    );

    return successResponse(
      res,
      200,
      "Model updated successfully",
      populatedModel
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists under this brand in this business"
      );
    }

    next(error);
  }
};

// =====================================================
// DELETE MODEL
// =====================================================

export const deleteModel = async (
  req,
  res,
  next
) => {
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
        "You are not authorized to delete models"
      );
    }

    const model = await Model.findOne(filter);

    if (!model) {
      return errorResponse(
        res,
        404,
        "Model not found"
      );
    }

    await Model.findByIdAndDelete(model._id);

    return successResponse(
      res,
      200,
      "Model deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};