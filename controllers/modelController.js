import Model from "../models/Model.js";
import Brand from "../models/Brand.js";
import Business from "../models/Business.js";
import BusinessType from "../models/BusinessType.js";
import User from "../models/User.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

import {
  getTenantContext,
  buildTenantQuery,
  isValidObjectId,
} from "../utils/tenantContext.js";

// =====================================================
// HELPERS
// =====================================================

const roleOf = (t) => t?.role?.toLowerCase?.() || "";
const isSuperAdmin = (t) => t?.isSuperAdmin === true;
const isAdmin = (t) => roleOf(t) === "admin";
const canWrite = (t) => isAdmin(t) || isSuperAdmin(t);

const populateModel = (query) =>
  query
    .populate("tenantOwner", "name email")
    .populate("business", "name")
    .populate("businessType", "name business")
    .populate("brand", "name")
    .populate("createdBy", "name email")
    .populate("updatedBy", "name email");

const validateBusinessContext = async (businessId, businessTypeId) => {
  if (!isValidObjectId(businessId)) {
    return { error: { status: 400, message: "Invalid business ID" } };
  }
  if (!isValidObjectId(businessTypeId)) {
    return { error: { status: 400, message: "Invalid business type ID" } };
  }

  const business = await Business.findOne({ _id: businessId, isActive: true });
  if (!business) {
    return { error: { status: 404, message: "Business not found or inactive" } };
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

  return { business, businessType };
};

const validateTenantOwner = async (tenantOwnerId, businessId, businessTypeId) => {
  if (!isValidObjectId(tenantOwnerId)) {
    return { error: { status: 400, message: "Invalid tenant owner ID" } };
  }

  const owner = await User.findById(tenantOwnerId)
    .select("_id role business businessType status")
    .populate({ path: "role", select: "slug" });

  if (!owner) {
    return { error: { status: 404, message: "Tenant owner not found" } };
  }
  if (owner.role?.slug?.toLowerCase() !== "admin") {
    return { error: { status: 400, message: "Tenant owner must be an Admin" } };
  }
  if (owner.status !== "active") {
    return { error: { status: 400, message: "Tenant owner is not active" } };
  }
  if (owner.business?.toString() !== String(businessId)) {
    return {
      error: {
        status: 400,
        message: "Tenant owner does not belong to this business",
      },
    };
  }
  if (owner.businessType?.toString() !== String(businessTypeId)) {
    return {
      error: {
        status: 400,
        message: "Tenant owner does not belong to this business type",
      },
    };
  }

  return { owner };
};

/** Brand must belong to same tenant + business + businessType. */
const validateBrand = async (brandId, tenantOwner, businessId, businessTypeId) => {
  if (!isValidObjectId(brandId)) {
    return { error: { status: 400, message: "Invalid brand ID" } };
  }

  const brand = await Brand.findOne({
    _id: brandId,
    tenantOwner,
    business: businessId,
    businessType: businessTypeId,
    isActive: true,
  });

  if (!brand) {
    return {
      error: {
        status: 404,
        message: "Brand not found in this tenant, business, or business type",
      },
    };
  }

  return { brand };
};

const modelTenantFilter = (id, tenant) => {
  const filter = { _id: id, ...buildTenantQuery(tenant) };
  if (!isSuperAdmin(tenant)) {
    if (tenant.business) filter.business = tenant.business;
    if (tenant.businessType) filter.businessType = tenant.businessType;
  }
  return filter;
};

// =====================================================
// CREATE
// =====================================================

export const createModel = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);

    if (!canWrite(tenant)) {
      return errorResponse(res, 403, "You are not authorized to create models");
    }

    const { name, description, isActive, brand } = req.body;
    if (!name?.trim()) {
      return errorResponse(res, 400, "Model name is required");
    }
    if (!brand) {
      return errorResponse(res, 400, "Brand is required");
    }

    let businessId;
    let businessTypeId;
    let tenantOwner;

    if (isAdmin(tenant)) {
      if (!tenant.tenantOwner || !tenant.business || !tenant.businessType) {
        return errorResponse(
          res,
          400,
          "Admin tenant context (owner, business, business type) is incomplete"
        );
      }
      tenantOwner = tenant.tenantOwner;
      businessId = tenant.business;
      businessTypeId = tenant.businessType;
    } else {
      businessId = req.body.business;
      businessTypeId = req.body.businessType;
      tenantOwner = req.body.tenantOwner;

      if (!businessId || !businessTypeId) {
        return errorResponse(
          res,
          400,
          "Business and business type are required for Super Admin"
        );
      }
      if (!tenantOwner) {
        return errorResponse(
          res,
          400,
          "Tenant owner is required for Super Admin"
        );
      }
    }

    const ctx = await validateBusinessContext(businessId, businessTypeId);
    if (ctx.error) {
      return errorResponse(res, ctx.error.status, ctx.error.message);
    }

    if (isSuperAdmin(tenant)) {
      const ownerCheck = await validateTenantOwner(
        tenantOwner,
        businessId,
        businessTypeId
      );
      if (ownerCheck.error) {
        return errorResponse(
          res,
          ownerCheck.error.status,
          ownerCheck.error.message
        );
      }
    }

    const brandCheck = await validateBrand(
      brand,
      tenantOwner,
      businessId,
      businessTypeId
    );
    if (brandCheck.error) {
      return errorResponse(
        res,
        brandCheck.error.status,
        brandCheck.error.message
      );
    }

    const trimmedName = name.trim();
    const duplicate = await Model.findOne({
      tenantOwner,
      business: businessId,
      brand,
      name: trimmedName,
    });
    if (duplicate) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists for this brand"
      );
    }

    const model = await Model.create({
      tenantOwner,
      business: businessId,
      businessType: businessTypeId,
      brand,
      createdBy: req.user._id,
      name: trimmedName,
      description: description?.trim() || "",
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const populated = await populateModel(Model.findById(model._id));
    return successResponse(res, 201, "Model created successfully", populated);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists for this brand"
      );
    }
    next(error);
  }
};

// =====================================================
// GET ALL
// =====================================================

export const getAllModels = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);
    const { business, businessType, tenantOwner, brand, search, isActive } =
      req.query;

    const filter = { ...buildTenantQuery(tenant) };

    if (!isSuperAdmin(tenant)) {
      if (!tenant.business || !tenant.businessType) {
        return errorResponse(
          res,
          400,
          "Tenant is not assigned to a business / business type"
        );
      }
      filter.business = tenant.business;
      filter.businessType = tenant.businessType;
    } else {
      if (business) {
        if (!isValidObjectId(business)) {
          return errorResponse(res, 400, "Invalid business ID");
        }
        filter.business = business;
      }
      if (businessType) {
        if (!isValidObjectId(businessType)) {
          return errorResponse(res, 400, "Invalid business type ID");
        }
        filter.businessType = businessType;
      }
      if (tenantOwner) {
        if (!isValidObjectId(tenantOwner)) {
          return errorResponse(res, 400, "Invalid tenant owner ID");
        }
        filter.tenantOwner = tenantOwner;
      }
    }

    if (brand) {
      if (!isValidObjectId(brand)) {
        return errorResponse(res, 400, "Invalid brand ID");
      }
      filter.brand = brand;
    }

    if (search?.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === "true" || isActive === true;
    }

    const models = await populateModel(Model.find(filter)).sort({ name: 1 });
    return successResponse(res, 200, "Models fetched successfully", models);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY BRAND
// =====================================================

export const getModelsByBrand = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);
    const { brandId } = req.params;

    if (!brandId || !isValidObjectId(brandId)) {
      return errorResponse(res, 400, "Valid brand ID is required");
    }

    if (!isSuperAdmin(tenant)) {
      if (!tenant.tenantOwner || !tenant.business || !tenant.businessType) {
        return errorResponse(res, 400, "Incomplete tenant context");
      }

      const brand = await Brand.findOne({
        _id: brandId,
        tenantOwner: tenant.tenantOwner,
        business: tenant.business,
        businessType: tenant.businessType,
      });
      if (!brand) {
        return errorResponse(res, 404, "Brand not found in your tenant");
      }

      const models = await populateModel(
        Model.find({
          tenantOwner: tenant.tenantOwner,
          business: tenant.business,
          businessType: tenant.businessType,
          brand: brandId,
          isActive: true,
        })
      ).sort({ name: 1 });

      return successResponse(res, 200, "Models fetched successfully", models);
    }

    const brand = await Brand.findById(brandId);
    if (!brand) {
      return errorResponse(res, 404, "Brand not found");
    }

    const models = await populateModel(
      Model.find({
        brand: brandId,
        isActive: true,
      })
    ).sort({ name: 1 });

    return successResponse(res, 200, "Models fetched successfully", models);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY ID
// =====================================================

export const getModelById = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid model ID");
    }

    const model = await populateModel(
      Model.findOne(modelTenantFilter(id, tenant))
    );
    if (!model) {
      return errorResponse(res, 404, "Model not found");
    }

    return successResponse(res, 200, "Model fetched successfully", model);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE
// =====================================================

export const updateModel = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);

    if (!canWrite(tenant)) {
      return errorResponse(res, 403, "You are not authorized to update models");
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid model ID");
    }

    const model = await Model.findOne(modelTenantFilter(id, tenant));
    if (!model) {
      return errorResponse(res, 404, "Model not found");
    }

    const {
      name,
      description,
      isActive,
      brand,
      business,
      businessType,
      tenantOwner,
    } = req.body;

    if (isAdmin(tenant)) {
      if (
        business !== undefined ||
        businessType !== undefined ||
        tenantOwner !== undefined
      ) {
        return errorResponse(
          res,
          403,
          "You cannot change the tenant, business, or business type of a model"
        );
      }
    }

    let finalTenantOwner = model.tenantOwner;
    let finalBusiness = model.business;
    let finalBusinessType = model.businessType;
    let finalBrand = model.brand;

    if (isSuperAdmin(tenant)) {
      if (tenantOwner !== undefined) finalTenantOwner = tenantOwner;
      if (business !== undefined) finalBusiness = business;
      if (businessType !== undefined) finalBusinessType = businessType;

      if (!finalTenantOwner) {
        return errorResponse(res, 400, "Tenant owner is required");
      }

      const ctx = await validateBusinessContext(finalBusiness, finalBusinessType);
      if (ctx.error) {
        return errorResponse(res, ctx.error.status, ctx.error.message);
      }

      const ownerCheck = await validateTenantOwner(
        finalTenantOwner,
        finalBusiness,
        finalBusinessType
      );
      if (ownerCheck.error) {
        return errorResponse(
          res,
          ownerCheck.error.status,
          ownerCheck.error.message
        );
      }
    }

    if (brand !== undefined) {
      const brandCheck = await validateBrand(
        brand,
        finalTenantOwner,
        finalBusiness,
        finalBusinessType
      );
      if (brandCheck.error) {
        return errorResponse(
          res,
          brandCheck.error.status,
          brandCheck.error.message
        );
      }
      finalBrand = brand;
    }

    const finalName = name !== undefined ? name.trim() : model.name;
    if (!finalName) {
      return errorResponse(res, 400, "Model name cannot be empty");
    }

    const duplicate = await Model.findOne({
      _id: { $ne: model._id },
      tenantOwner: finalTenantOwner,
      business: finalBusiness,
      brand: finalBrand,
      name: finalName,
    });
    if (duplicate) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists for this brand"
      );
    }

    model.name = finalName;
    model.brand = finalBrand;
    if (description !== undefined) model.description = description.trim();
    if (isActive !== undefined) model.isActive = Boolean(isActive);

    if (isSuperAdmin(tenant)) {
      model.tenantOwner = finalTenantOwner;
      model.business = finalBusiness;
      model.businessType = finalBusinessType;
    }

    model.updatedBy = req.user._id;
    await model.save();

    const populated = await populateModel(Model.findById(model._id));
    return successResponse(res, 200, "Model updated successfully", populated);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A model with this name already exists for this brand"
      );
    }
    next(error);
  }
};

// =====================================================
// DELETE
// =====================================================

export const deleteModel = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);

    if (!canWrite(tenant)) {
      return errorResponse(res, 403, "You are not authorized to delete models");
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid model ID");
    }

    const model = await Model.findOne(modelTenantFilter(id, tenant));
    if (!model) {
      return errorResponse(res, 404, "Model not found");
    }

    await Model.findByIdAndDelete(model._id);
    return successResponse(res, 200, "Model deleted successfully");
  } catch (error) {
    next(error);
  }
};