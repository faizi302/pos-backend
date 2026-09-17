import Joi from "joi";

import Permission from "../models/Permission.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// JOI VALIDATION
// =====================================================

// -----------------------------------------------------
// CREATE PERMISSION
// -----------------------------------------------------

const createPermissionSchema = Joi.object({
  resource: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(50)
    .required()
    .messages({
      "string.empty": "Resource is required",
      "string.min": "Resource must be at least 2 characters",
      "string.max": "Resource cannot exceed 50 characters",
      "any.required": "Resource is required",
    }),

  action: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(50)
    .required()
    .messages({
      "string.empty": "Action is required",
      "string.min": "Action must be at least 2 characters",
      "string.max": "Action cannot exceed 50 characters",
      "any.required": "Action is required",
    }),

  name: Joi.string()
    .trim()
    .lowercase()
    .max(100)
    .required()
    .messages({
      "string.empty": "Permission name is required",
      "string.max": "Permission name cannot exceed 100 characters",
      "any.required": "Permission name is required",
    }),

  description: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .messages({
      "string.max":
        "Description cannot exceed 255 characters",
    }),

  isActive: Joi.boolean()
    .default(true),
});

// -----------------------------------------------------
// UPDATE PERMISSION
// -----------------------------------------------------

const updatePermissionSchema = Joi.object({
  resource: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(50)
    .messages({
      "string.min": "Resource must be at least 2 characters",
      "string.max": "Resource cannot exceed 50 characters",
    }),

  action: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(50)
    .messages({
      "string.min": "Action must be at least 2 characters",
      "string.max": "Action cannot exceed 50 characters",
    }),

  name: Joi.string()
    .trim()
    .lowercase()
    .max(100)
    .messages({
      "string.max": "Permission name cannot exceed 100 characters",
    }),

  description: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .messages({
      "string.max":
        "Description cannot exceed 255 characters",
    }),

  isActive: Joi.boolean(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update",
  });

// -----------------------------------------------------
// OBJECT ID VALIDATION
// -----------------------------------------------------

const objectIdSchema = Joi.object({
  id: Joi.string()
    .hex()
    .length(24)
    .required()
    .messages({
      "string.hex": "Invalid permission ID",
      "string.length": "Invalid permission ID",
      "any.required": "Permission ID is required",
    }),
});

// =====================================================
// CREATE PERMISSION
// =====================================================

export const createPermission = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE REQUEST BODY
    // -------------------------------------------------

    const { error, value } =
      createPermissionSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

    if (error) {
      return errorResponse(
        res,
        400,
        "Validation failed",
        error.details.map(
          (detail) => detail.message
        )
      );
    }

    const {
      resource,
      action,
      name,
      description,
      isActive,
    } = value;

    // -------------------------------------------------
    // CHECK RESOURCE + ACTION
    // -------------------------------------------------

    const existingResourceAction =
      await Permission.findOne({
        resource,
        action,
      });

    if (existingResourceAction) {
      return errorResponse(
        res,
        409,
        "Permission for this resource and action already exists"
      );
    }

    // -------------------------------------------------
    // CHECK PERMISSION NAME
    // -------------------------------------------------

    const existingName =
      await Permission.findOne({ name });

    if (existingName) {
      return errorResponse(
        res,
        409,
        "Permission name already exists"
      );
    }

    // -------------------------------------------------
    // CREATE PERMISSION
    // -------------------------------------------------

    const permission = await Permission.create({
      resource,
      action,
      name,
      description,
      isActive,
    });

    // -------------------------------------------------
    // RESPONSE
    // -------------------------------------------------

    return successResponse(
      res,
      201,
      "Permission created successfully",
      permission
    );
  } catch (error) {
    // MongoDB duplicate key protection
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "Permission already exists"
      );
    }

    next(error);
  }
};

// =====================================================
// GET ALL PERMISSIONS
// =====================================================

export const getAllPermissions = async (
  req,
  res,
  next
) => {
  try {
    const permissions = await Permission.find()
      .sort({
        resource: 1,
        action: 1,
      });

    return successResponse(
      res,
      200,
      "Permissions fetched successfully",
      permissions
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET PERMISSION BY ID
// =====================================================

export const getPermissionById = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error } =
      objectIdSchema.validate(req.params);

    if (error) {
      return errorResponse(
        res,
        400,
        "Invalid permission ID"
      );
    }

    // -------------------------------------------------
    // FIND PERMISSION
    // -------------------------------------------------

    const permission =
      await Permission.findById(req.params.id);

    if (!permission) {
      return errorResponse(
        res,
        404,
        "Permission not found"
      );
    }

    return successResponse(
      res,
      200,
      "Permission fetched successfully",
      permission
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE PERMISSION
// =====================================================

export const updatePermission = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error: idError } =
      objectIdSchema.validate(req.params);

    if (idError) {
      return errorResponse(
        res,
        400,
        "Invalid permission ID"
      );
    }

    // -------------------------------------------------
    // VALIDATE BODY
    // -------------------------------------------------

    const { error, value } =
      updatePermissionSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

    if (error) {
      return errorResponse(
        res,
        400,
        "Validation failed",
        error.details.map(
          (detail) => detail.message
        )
      );
    }

    // -------------------------------------------------
    // FIND PERMISSION
    // -------------------------------------------------

    const permission =
      await Permission.findById(req.params.id);

    if (!permission) {
      return errorResponse(
        res,
        404,
        "Permission not found"
      );
    }

    // -------------------------------------------------
    // CHECK RESOURCE + ACTION DUPLICATE
    // -------------------------------------------------

    const resource =
      value.resource ?? permission.resource;

    const action =
      value.action ?? permission.action;

    const duplicate =
      await Permission.findOne({
        resource,
        action,
        _id: {
          $ne: permission._id,
        },
      });

    if (duplicate) {
      return errorResponse(
        res,
        409,
        "Permission for this resource and action already exists"
      );
    }

    // -------------------------------------------------
    // CHECK NAME DUPLICATE
    // -------------------------------------------------

    if (
      value.name &&
      value.name !== permission.name
    ) {
      const existingName =
        await Permission.findOne({
          name: value.name,
          _id: {
            $ne: permission._id,
          },
        });

      if (existingName) {
        return errorResponse(
          res,
          409,
          "Permission name already exists"
        );
      }
    }

    // -------------------------------------------------
    // UPDATE FIELDS
    // -------------------------------------------------

    if (value.resource !== undefined) {
      permission.resource = value.resource;
    }

    if (value.action !== undefined) {
      permission.action = value.action;
    }

    if (value.name !== undefined) {
      permission.name = value.name;
    }

    if (value.description !== undefined) {
      permission.description =
        value.description;
    }

    if (value.isActive !== undefined) {
      permission.isActive =
        value.isActive;
    }

    // -------------------------------------------------
    // SAVE
    // -------------------------------------------------

    await permission.save();

    return successResponse(
      res,
      200,
      "Permission updated successfully",
      permission
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "Permission already exists"
      );
    }

    next(error);
  }
};

// =====================================================
// DELETE PERMISSION
// =====================================================

export const deletePermission = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error } =
      objectIdSchema.validate(req.params);

    if (error) {
      return errorResponse(
        res,
        400,
        "Invalid permission ID"
      );
    }

    // -------------------------------------------------
    // FIND PERMISSION
    // -------------------------------------------------

    const permission =
      await Permission.findById(req.params.id);

    if (!permission) {
      return errorResponse(
        res,
        404,
        "Permission not found"
      );
    }

    // -------------------------------------------------
    // DELETE
    // -------------------------------------------------

    await Permission.findByIdAndDelete(
      req.params.id
    );

    return successResponse(
      res,
      200,
      "Permission deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// TOGGLE PERMISSION STATUS
// =====================================================

export const togglePermissionStatus = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error } =
      objectIdSchema.validate(req.params);

    if (error) {
      return errorResponse(
        res,
        400,
        "Invalid permission ID"
      );
    }

    // -------------------------------------------------
    // FIND PERMISSION
    // -------------------------------------------------

    const permission =
      await Permission.findById(req.params.id);

    if (!permission) {
      return errorResponse(
        res,
        404,
        "Permission not found"
      );
    }

    // -------------------------------------------------
    // TOGGLE STATUS
    // -------------------------------------------------

    permission.isActive =
      !permission.isActive;

    await permission.save();

    return successResponse(
      res,
      200,
      `Permission ${
        permission.isActive
          ? "activated"
          : "deactivated"
      } successfully`,
      permission
    );
  } catch (error) {
    next(error);
  }
};