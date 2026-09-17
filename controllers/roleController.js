import Joi from "joi";

import Role from "../models/Role.js";
import Permission from "../models/Permission.js";

import {
  successResponse,
  errorResponse,
} from "../utils/apiResponse.js";

// =====================================================
// JOI VALIDATION
// =====================================================

// -----------------------------------------------------
// OBJECT ID VALIDATION
// -----------------------------------------------------

const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({
    "string.hex": "Invalid ID format",
    "string.length": "Invalid ID format",
  });

// -----------------------------------------------------
// CREATE ROLE VALIDATION
// -----------------------------------------------------

const createRoleSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      "string.empty": "Role name is required",
      "string.min":
        "Role name must be at least 2 characters",
      "string.max":
        "Role name cannot exceed 50 characters",
      "any.required": "Role name is required",
    }),

  slug: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(50)
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .required()
    .messages({
      "string.empty": "Role slug is required",
      "string.min":
        "Role slug must be at least 2 characters",
      "string.max":
        "Role slug cannot exceed 50 characters",
      "string.pattern.base":
        "Role slug can only contain lowercase letters, numbers, and hyphens",
      "any.required": "Role slug is required",
    }),

  description: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .messages({
      "string.max":
        "Description cannot exceed 255 characters",
    }),

  permissions: Joi.array()
    .items(objectId)
    .unique()
    .default([])
    .messages({
      "array.base":
        "Permissions must be an array",
      "array.unique":
        "Duplicate permission IDs are not allowed",
    }),

  isActive: Joi.boolean()
    .default(true),
});

// -----------------------------------------------------
// UPDATE ROLE VALIDATION
// -----------------------------------------------------

const updateRoleSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .messages({
      "string.min":
        "Role name must be at least 2 characters",
      "string.max":
        "Role name cannot exceed 50 characters",
    }),

  slug: Joi.string()
    .trim()
    .lowercase()
    .min(2)
    .max(50)
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .messages({
      "string.min":
        "Role slug must be at least 2 characters",
      "string.max":
        "Role slug cannot exceed 50 characters",
      "string.pattern.base":
        "Role slug can only contain lowercase letters, numbers, and hyphens",
    }),

  description: Joi.string()
    .trim()
    .max(255)
    .allow("", null)
    .messages({
      "string.max":
        "Description cannot exceed 255 characters",
    }),

  permissions: Joi.array()
    .items(objectId)
    .unique()
    .messages({
      "array.base":
        "Permissions must be an array",
      "array.unique":
        "Duplicate permission IDs are not allowed",
    }),

  isActive: Joi.boolean(),
})
  .min(1)
  .messages({
    "object.min":
      "At least one field is required to update",
  });

// -----------------------------------------------------
// PARAM ID VALIDATION
// -----------------------------------------------------

const roleIdSchema = Joi.object({
  id: objectId.required().messages({
    "any.required": "Role ID is required",
  }),
});

// =====================================================
// HELPER
// Validate permission IDs
// =====================================================

const validatePermissions = async (permissionIds) => {
  if (!permissionIds || permissionIds.length === 0) {
    return {
      valid: true,
      permissions: [],
    };
  }

  const permissions = await Permission.find({
    _id: {
      $in: permissionIds,
    },
  });

  // ---------------------------------------------------
  // CHECK ALL IDS EXIST
  // ---------------------------------------------------

  if (permissions.length !== permissionIds.length) {
    return {
      valid: false,
      message:
        "One or more permission IDs are invalid",
    };
  }

  // ---------------------------------------------------
  // CHECK ACTIVE PERMISSIONS
  // ---------------------------------------------------

  const inactivePermissions =
    permissions.filter(
      (permission) => !permission.isActive
    );

  if (inactivePermissions.length > 0) {
    return {
      valid: false,
      message:
        "One or more selected permissions are inactive",
    };
  }

  return {
    valid: true,
    permissions,
  };
};

// =====================================================
// CREATE ROLE
// =====================================================

export const createRole = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE BODY
    // -------------------------------------------------

    const { error, value } =
      createRoleSchema.validate(req.body, {
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
      name,
      slug,
      description,
      permissions,
      isActive,
    } = value;

    // -------------------------------------------------
    // CHECK DUPLICATE SLUG
    // -------------------------------------------------

    const existingSlug =
      await Role.findOne({ slug });

    if (existingSlug) {
      return errorResponse(
        res,
        409,
        "Role with this slug already exists"
      );
    }

    // -------------------------------------------------
    // CHECK PERMISSIONS
    // -------------------------------------------------

    const permissionResult =
      await validatePermissions(
        permissions
      );

    if (!permissionResult.valid) {
      return errorResponse(
        res,
        400,
        permissionResult.message
      );
    }

    // -------------------------------------------------
    // CREATE ROLE
    // -------------------------------------------------

    const role = await Role.create({
      name,
      slug,
      description,
      permissions,
      isActive,
    });

    // -------------------------------------------------
    // POPULATE PERMISSIONS
    // -------------------------------------------------

    await role.populate({
      path: "permissions",
      select:
        "name resource action description isActive",
    });

    return successResponse(
      res,
      201,
      "Role created successfully",
      role
    );
  } catch (error) {
    // -------------------------------------------------
    // DUPLICATE KEY
    // -------------------------------------------------

    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "Role with this slug already exists"
      );
    }

    next(error);
  }
};

// =====================================================
// GET ALL ROLES
// =====================================================

export const getAllRoles = async (
  req,
  res,
  next
) => {
  try {
    const roles = await Role.find()
      .populate({
        path: "permissions",
        select:
          "name resource action description isActive",
      })
      .sort({
        createdAt: -1,
      });

    return successResponse(
      res,
      200,
      "Roles fetched successfully",
      roles
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET ROLE BY ID
// =====================================================

export const getRoleById = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error } =
      roleIdSchema.validate(req.params);

    if (error) {
      return errorResponse(
        res,
        400,
        "Invalid role ID"
      );
    }

    // -------------------------------------------------
    // FIND ROLE
    // -------------------------------------------------

    const role = await Role.findById(
      req.params.id
    ).populate({
      path: "permissions",
      select:
        "name resource action description isActive",
    });

    if (!role) {
      return errorResponse(
        res,
        404,
        "Role not found"
      );
    }

    return successResponse(
      res,
      200,
      "Role fetched successfully",
      role
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE ROLE
// =====================================================

export const updateRole = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error: idError } =
      roleIdSchema.validate(req.params);

    if (idError) {
      return errorResponse(
        res,
        400,
        "Invalid role ID"
      );
    }

    // -------------------------------------------------
    // VALIDATE BODY
    // -------------------------------------------------

    const { error, value } =
      updateRoleSchema.validate(req.body, {
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
    // FIND ROLE
    // -------------------------------------------------

    const role = await Role.findById(
      req.params.id
    );

    if (!role) {
      return errorResponse(
        res,
        404,
        "Role not found"
      );
    }

    // -------------------------------------------------
    // CHECK DUPLICATE SLUG
    // -------------------------------------------------

    if (
      value.slug &&
      value.slug !== role.slug
    ) {
      const existingRole =
        await Role.findOne({
          slug: value.slug,
          _id: {
            $ne: role._id,
          },
        });

      if (existingRole) {
        return errorResponse(
          res,
          409,
          "Role with this slug already exists"
        );
      }
    }

    // -------------------------------------------------
    // CHECK PERMISSIONS
    // -------------------------------------------------

    if (value.permissions !== undefined) {
      const permissionResult =
        await validatePermissions(
          value.permissions
        );

      if (!permissionResult.valid) {
        return errorResponse(
          res,
          400,
          permissionResult.message
        );
      }

      role.permissions =
        value.permissions;
    }

    // -------------------------------------------------
    // UPDATE BASIC FIELDS
    // -------------------------------------------------

    if (value.name !== undefined) {
      role.name = value.name;
    }

    if (value.slug !== undefined) {
      role.slug = value.slug;
    }

    if (value.description !== undefined) {
      role.description =
        value.description;
    }

    if (value.isActive !== undefined) {
      role.isActive =
        value.isActive;
    }

    // -------------------------------------------------
    // SAVE
    // -------------------------------------------------

    await role.save();

    // -------------------------------------------------
    // POPULATE PERMISSIONS
    // -------------------------------------------------

    await role.populate({
      path: "permissions",
      select:
        "name resource action description isActive",
    });

    return successResponse(
      res,
      200,
      "Role updated successfully",
      role
    );
  } catch (error) {
    if (error.code === 11000) {
      return errorResponse(
        res,
        409,
        "Role with this slug already exists"
      );
    }

    next(error);
  }
};

// =====================================================
// DELETE ROLE
// =====================================================

export const deleteRole = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error } =
      roleIdSchema.validate(req.params);

    if (error) {
      return errorResponse(
        res,
        400,
        "Invalid role ID"
      );
    }

    // -------------------------------------------------
    // FIND ROLE
    // -------------------------------------------------

    const role = await Role.findById(
      req.params.id
    );

    if (!role) {
      return errorResponse(
        res,
        404,
        "Role not found"
      );
    }

    // -------------------------------------------------
    // DELETE ROLE
    // -------------------------------------------------

    await Role.findByIdAndDelete(
      req.params.id
    );

    return successResponse(
      res,
      200,
      "Role deleted successfully"
    );
  } catch (error) {
    next(error);
  }
};

// =====================================================
// TOGGLE ROLE STATUS
// =====================================================

export const toggleRoleStatus = async (
  req,
  res,
  next
) => {
  try {
    // -------------------------------------------------
    // VALIDATE ID
    // -------------------------------------------------

    const { error } =
      roleIdSchema.validate(req.params);

    if (error) {
      return errorResponse(
        res,
        400,
        "Invalid role ID"
      );
    }

    // -------------------------------------------------
    // FIND ROLE
    // -------------------------------------------------

    const role = await Role.findById(
      req.params.id
    );

    if (!role) {
      return errorResponse(
        res,
        404,
        "Role not found"
      );
    }

    // -------------------------------------------------
    // TOGGLE STATUS
    // -------------------------------------------------

    role.isActive = !role.isActive;

    await role.save();

    return successResponse(
      res,
      200,
      `Role ${
        role.isActive
          ? "activated"
          : "deactivated"
      } successfully`,
      role
    );
  } catch (error) {
    next(error);
  }
};