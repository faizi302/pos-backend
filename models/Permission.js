import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema(
  {
    // ==========================================
    // Resource
    // Example: products, customers, sales
    // ==========================================

    resource: {
      type: String,
      required: [true, "Permission resource is required"],
      trim: true,
      lowercase: true,
    },

    // ==========================================
    // Action
    // Example: create, read, update, delete
    // ==========================================

    action: {
      type: String,
      required: [true, "Permission action is required"],
      trim: true,
      lowercase: true,
    },

    // ==========================================
    // Permission Name
    // Example: products.create
    // ==========================================

    name: {
      type: String,
      required: [true, "Permission name is required"],
      unique: true,
      trim: true,
      lowercase: true,
    },

    // ==========================================
    // Description
    // ==========================================

    description: {
      type: String,
      trim: true,
    },

    // ==========================================
    // Status
    // ==========================================

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate resource + action
permissionSchema.index(
  { resource: 1, action: 1 },
  { unique: true }
);

const Permission = mongoose.model(
  "Permission",
  permissionSchema
);

export default Permission;