import Business from "../models/Business.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// CREATE BUSINESS
// =====================================================

export const createBusiness = async (req, res, next) => {
  try {
    const { name, isActive } = req.body;

    // -------------------------------------------------
    // CHECK DUPLICATE BUSINESS
    // -------------------------------------------------

    const existingBusiness = await Business.findOne({
      name: name.trim(),
    });

    if (existingBusiness) {
      return errorResponse(
        res,
        409,
        "Business with this name already exists"
      );
    }

    // -------------------------------------------------
    // CREATE BUSINESS
    // -------------------------------------------------

    const business = await Business.create({
      name: name.trim(),
      isActive: isActive !== undefined ? isActive : true,
    });

    return successResponse(
      res,
      201,
      "Business created successfully",
      business
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET ALL BUSINESSES
// =====================================================

// =====================================================
// GET PUBLIC BUSINESSES
// =====================================================

export const getPublicBusinesses = async (req, res, next) => {
  try {
    const businesses = await Business.find({
      isActive: true,
    })
      .select("_id name")
      .sort({ name: 1 });

    return successResponse(
      res,
      200,
      "Businesses fetched successfully",
      businesses
    );
  } catch (error) {
    next(error);
  }
};

export const getAllBusinesses = async (req, res, next) => {
  try {
    const businesses = await Business.find()
      .sort({ createdAt: -1 });

    return successResponse(
      res,
      200,
      "Businesses fetched successfully",
      businesses
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET BUSINESS BY ID
// =====================================================

export const getBusinessById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const business = await Business.findById(id);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found"
      );
    }

    return successResponse(
      res,
      200,
      "Business fetched successfully",
      business
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE BUSINESS
// =====================================================

export const updateBusiness = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, isActive } = req.body;

    // -------------------------------------------------
    // FIND BUSINESS
    // -------------------------------------------------

    const business = await Business.findById(id);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found"
      );
    }

    // -------------------------------------------------
    // UPDATE NAME
    // -------------------------------------------------

    if (name !== undefined) {
      const trimmedName = name.trim();

      // Check duplicate name
      const existingBusiness = await Business.findOne({
        name: trimmedName,
        _id: { $ne: id },
      });

      if (existingBusiness) {
        return errorResponse(
          res,
          409,
          "Another business with this name already exists"
        );
      }

      business.name = trimmedName;
    }

    // -------------------------------------------------
    // UPDATE STATUS
    // -------------------------------------------------

    if (isActive !== undefined) {
      business.isActive = isActive;
    }

    // -------------------------------------------------
    // SAVE
    // -------------------------------------------------

    await business.save();

    return successResponse(
      res,
      200,
      "Business updated successfully",
      business
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// DELETE BUSINESS
// =====================================================

export const deleteBusiness = async (req, res, next) => {
  try {
    const { id } = req.params;

    // -------------------------------------------------
    // FIND BUSINESS
    // -------------------------------------------------

    const business = await Business.findById(id);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found"
      );
    }

    // -------------------------------------------------
    // DELETE BUSINESS
    // -------------------------------------------------

    await Business.findByIdAndDelete(id);

    return successResponse(
      res,
      200,
      "Business deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};
