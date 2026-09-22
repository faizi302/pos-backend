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

const populateBrand = (query) =>
  query
    .populate("tenantOwner", "name email")
    .populate("business", "name")
    .populate("businessType", "name business")
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

const brandTenantFilter = (id, tenant) => {
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

export const createBrand = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);

    if (!canWrite(tenant)) {
      return errorResponse(res, 403, "You are not authorized to create brands");
    }

    const { name, description, isActive } = req.body;
    if (!name?.trim()) {
      return errorResponse(res, 400, "Brand name is required");
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

    const trimmedName = name.trim();
    const duplicate = await Brand.findOne({
      tenantOwner,
      business: businessId,
      businessType: businessTypeId,
      name: trimmedName,
    });
    if (duplicate) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in your business"
      );
    }

    const brand = await Brand.create({
      tenantOwner,
      business: businessId,
      businessType: businessTypeId,
      createdBy: req.user._id,
      name: trimmedName,
      description: description?.trim() || "",
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const populated = await populateBrand(Brand.findById(brand._id));
    return successResponse(res, 201, "Brand created successfully", populated);
  } catch (error) {
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
// GET ALL
// =====================================================

export const getAllBrands = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);
    const { business, businessType, tenantOwner, search, isActive } = req.query;

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

    if (search?.trim()) {
      filter.name = { $regex: search.trim(), $options: "i" };
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === "true" || isActive === true;
    }

    const brands = await populateBrand(Brand.find(filter)).sort({ name: 1 });
    return successResponse(res, 200, "Brands fetched successfully", brands);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY BUSINESS TYPE
// =====================================================

export const getBrandsByBusinessType = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);
    const { businessTypeId } = req.params;

    if (!businessTypeId || !isValidObjectId(businessTypeId)) {
      return errorResponse(res, 400, "Valid business type ID is required");
    }

    if (!isSuperAdmin(tenant)) {
      if (!tenant.tenantOwner || !tenant.business || !tenant.businessType) {
        return errorResponse(res, 400, "Incomplete tenant context");
      }
      if (String(tenant.businessType) !== String(businessTypeId)) {
        return errorResponse(
          res,
          403,
          "You cannot access brands from another business type"
        );
      }

      const businessType = await BusinessType.findOne({
        _id: businessTypeId,
        business: tenant.business,
        isActive: true,
      });
      if (!businessType) {
        return errorResponse(res, 404, "Business type not found");
      }

      const brands = await populateBrand(
        Brand.find({
          tenantOwner: tenant.tenantOwner,
          business: tenant.business,
          businessType: businessTypeId,
          isActive: true,
        })
      ).sort({ name: 1 });

      return successResponse(res, 200, "Brands fetched successfully", brands);
    }

    const businessType = await BusinessType.findById(businessTypeId);
    if (!businessType) {
      return errorResponse(res, 404, "Business type not found");
    }
    if (!businessType.isActive) {
      return errorResponse(res, 400, "Business type is inactive");
    }

    const brands = await populateBrand(
      Brand.find({
        business: businessType.business,
        businessType: businessTypeId,
        isActive: true,
      })
    ).sort({ name: 1 });

    return successResponse(res, 200, "Brands fetched successfully", brands);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BY ID
// =====================================================

export const getBrandById = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid brand ID");
    }

    const brand = await populateBrand(
      Brand.findOne(brandTenantFilter(id, tenant))
    );
    if (!brand) {
      return errorResponse(res, 404, "Brand not found");
    }

    return successResponse(res, 200, "Brand fetched successfully", brand);
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE
// =====================================================

export const updateBrand = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);

    if (!canWrite(tenant)) {
      return errorResponse(res, 403, "You are not authorized to update brands");
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid brand ID");
    }

    const brand = await Brand.findOne(brandTenantFilter(id, tenant));
    if (!brand) {
      return errorResponse(res, 404, "Brand not found");
    }

    const { name, description, isActive, business, businessType, tenantOwner } =
      req.body;

    if (isAdmin(tenant)) {
      if (
        business !== undefined ||
        businessType !== undefined ||
        tenantOwner !== undefined
      ) {
        return errorResponse(
          res,
          403,
          "You cannot change the tenant, business, or business type of a brand"
        );
      }
    }

    let finalTenantOwner = brand.tenantOwner;
    let finalBusiness = brand.business;
    let finalBusinessType = brand.businessType;

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

    const finalName = name !== undefined ? name.trim() : brand.name;
    if (!finalName) {
      return errorResponse(res, 400, "Brand name cannot be empty");
    }

    const duplicate = await Brand.findOne({
      _id: { $ne: brand._id },
      tenantOwner: finalTenantOwner,
      business: finalBusiness,
      businessType: finalBusinessType,
      name: finalName,
    });
    if (duplicate) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in this tenant"
      );
    }

    brand.name = finalName;
    if (description !== undefined) brand.description = description.trim();
    if (isActive !== undefined) brand.isActive = Boolean(isActive);

    if (isSuperAdmin(tenant)) {
      brand.tenantOwner = finalTenantOwner;
      brand.business = finalBusiness;
      brand.businessType = finalBusinessType;
    }

    brand.updatedBy = req.user._id;
    await brand.save();

    const populated = await populateBrand(Brand.findById(brand._id));
    return successResponse(res, 200, "Brand updated successfully", populated);
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "A brand with this name already exists in this tenant"
      );
    }
    next(error);
  }
};

// =====================================================
// DELETE
// =====================================================

export const deleteBrand = async (req, res, next) => {
  try {
    const tenant = await getTenantContext(req);

    if (!canWrite(tenant)) {
      return errorResponse(res, 403, "You are not authorized to delete brands");
    }

    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return errorResponse(res, 400, "Invalid brand ID");
    }

    const brand = await Brand.findOne(brandTenantFilter(id, tenant));
    if (!brand) {
      return errorResponse(res, 404, "Brand not found");
    }

    await Brand.findByIdAndDelete(brand._id);
    return successResponse(res, 200, "Brand deleted successfully");
  } catch (error) {
    next(error);
  }
};