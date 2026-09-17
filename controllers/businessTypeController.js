import BusinessType from "../models/BusinessType.js";
import Business from "../models/Business.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// CREATE BUSINESS TYPE
// =====================================================

export const createBusinessType = async (req, res, next) => {
  try {
    const {
      name,
      business,
      description,
      isActive,
    } = req.body;

    // -------------------------------------------------
    // CHECK BUSINESS
    // -------------------------------------------------

    const existingBusiness = await Business.findById(business);

    if (!existingBusiness) {
      return errorResponse(
        res,
        404,
        "Selected business not found"
      );
    }

    if (!existingBusiness.isActive) {
      return errorResponse(
        res,
        400,
        "Selected business is inactive"
      );
    }

    // -------------------------------------------------
    // CHECK DUPLICATE BUSINESS TYPE
    // -------------------------------------------------

    const existingBusinessType =
      await BusinessType.findOne({
        business,
        name: name.trim(),
      });

    if (existingBusinessType) {
      return errorResponse(
        res,
        409,
        "Business type with this name already exists for this business"
      );
    }

    // -------------------------------------------------
    // CREATE BUSINESS TYPE
    // -------------------------------------------------

    const businessType = await BusinessType.create({
      name: name.trim(),
      business,
      description,
      isActive:
        isActive !== undefined ? isActive : true,
    });

    // -------------------------------------------------
    // POPULATE BUSINESS
    // -------------------------------------------------

    await businessType.populate({
      path: "business",
      select: "name",
    });

    return successResponse(
      res,
      201,
      "Business type created successfully",
      businessType
    );
  } catch (error) {
    next(error);
  }
};


// =====================================================
// GET PUBLIC BUSINESS TYPES BY BUSINESS
// =====================================================

export const getPublicBusinessTypesByBusiness = async (
  req,
  res,
  next
) => {
  try {
    const { businessId } = req.params;

    // -------------------------------------------------
    // CHECK BUSINESS
    // -------------------------------------------------

    const business = await Business.findOne({
      _id: businessId,
      isActive: true,
    });

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found"
      );
    }

    // -------------------------------------------------
    // GET ACTIVE BUSINESS TYPES
    // -------------------------------------------------

    const businessTypes = await BusinessType.find({
      business: businessId,
      isActive: true,
    })
      .select("_id name")
      .sort({ name: 1 });

    return successResponse(
      res,
      200,
      "Business types fetched successfully",
      businessTypes
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET ALL BUSINESS TYPES
// =====================================================

export const getAllBusinessTypes = async (
  req,
  res,
  next
) => {
  try {
    const businessTypes = await BusinessType.find()
      .populate({
        path: "business",
        select: "name",
      })
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      200,
      "Business types fetched successfully",
      businessTypes
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BUSINESS TYPES BY BUSINESS
// =====================================================

export const getBusinessTypesByBusiness = async (
  req,
  res,
  next
) => {
  try {
    const { businessId } = req.params;

    // -------------------------------------------------
    // CHECK BUSINESS
    // -------------------------------------------------

    const existingBusiness = await Business.findById(
      businessId
    );

    if (!existingBusiness) {
      return errorResponse(
        res,
        404,
        "Business not found"
      );
    }

    // -------------------------------------------------
    // GET BUSINESS TYPES
    // -------------------------------------------------

    const businessTypes = await BusinessType.find({
      business: businessId,
    })
      .populate({
        path: "business",
        select: "name",
      })
      .sort({ name: 1 });

    return successResponse(
      res,
      200,
      "Business types fetched successfully",
      businessTypes
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BUSINESS TYPE BY ID
// =====================================================

export const getBusinessTypeById = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const businessType = await BusinessType.findById(id)
      .populate({
        path: "business",
        select: "name",
      });

    if (!businessType) {
      return errorResponse(
        res,
        404,
        "Business type not found"
      );
    }

    return successResponse(
      res,
      200,
      "Business type fetched successfully",
      businessType
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE BUSINESS TYPE
// =====================================================

export const updateBusinessType = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    const {
      name,
      business,
      description,
      isActive,
    } = req.body;

    // -------------------------------------------------
    // FIND BUSINESS TYPE
    // -------------------------------------------------

    const businessType =
      await BusinessType.findById(id);

    if (!businessType) {
      return errorResponse(
        res,
        404,
        "Business type not found"
      );
    }

    // -------------------------------------------------
    // DETERMINE FINAL BUSINESS
    // -------------------------------------------------

    let finalBusinessId =
      businessType.business;

    if (business !== undefined) {
      finalBusinessId = business;
    }

    // -------------------------------------------------
    // CHECK BUSINESS
    // -------------------------------------------------

    if (
      business !== undefined &&
      business !== null &&
      business !== ""
    ) {
      const existingBusiness =
        await Business.findById(business);

      if (!existingBusiness) {
        return errorResponse(
          res,
          404,
          "Selected business not found"
        );
      }

      if (!existingBusiness.isActive) {
        return errorResponse(
          res,
          400,
          "Selected business is inactive"
        );
      }
    }

    // -------------------------------------------------
    // UPDATE NAME
    // -------------------------------------------------

    if (name !== undefined) {
      const trimmedName = name.trim();

      const duplicateBusinessType =
        await BusinessType.findOne({
          name: trimmedName,
          business: finalBusinessId,
          _id: { $ne: id },
        });

      if (duplicateBusinessType) {
        return errorResponse(
          res,
          409,
          "Business type with this name already exists for this business"
        );
      }

      businessType.name = trimmedName;
    }

    // -------------------------------------------------
    // UPDATE BUSINESS
    // -------------------------------------------------

    if (business !== undefined) {
      businessType.business = business;
    }

    // -------------------------------------------------
    // UPDATE DESCRIPTION
    // -------------------------------------------------

    if (description !== undefined) {
      businessType.description = description;
    }

    // -------------------------------------------------
    // UPDATE STATUS
    // -------------------------------------------------

    if (isActive !== undefined) {
      businessType.isActive = isActive;
    }

    // -------------------------------------------------
    // SAVE
    // -------------------------------------------------

    await businessType.save();

    // -------------------------------------------------
    // POPULATE BUSINESS
    // -------------------------------------------------

    await businessType.populate({
      path: "business",
      select: "name",
    });

    return successResponse(
      res,
      200,
      "Business type updated successfully",
      businessType
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// DELETE BUSINESS TYPE
// =====================================================

export const deleteBusinessType = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    // -------------------------------------------------
    // FIND BUSINESS TYPE
    // -------------------------------------------------

    const businessType =
      await BusinessType.findById(id);

    if (!businessType) {
      return errorResponse(
        res,
        404,
        "Business type not found"
      );
    }

    // -------------------------------------------------
    // DELETE BUSINESS TYPE
    // -------------------------------------------------

    await BusinessType.findByIdAndDelete(id);

    return successResponse(
      res,
      200,
      "Business type deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};
