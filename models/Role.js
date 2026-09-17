import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    // ==========================================
    // Role Name
    // ==========================================

    name: {
      type: String,
      required: [true, "Role name is required"],
      trim: true,
      maxlength: 50,
    },

    // ==========================================
    // Role Slug
    // Example: admin, manager, cashier
    // ==========================================

    slug: {
      type: String,
      required: [true, "Role slug is required"],
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
    // Permissions
    // ==========================================

    permissions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],

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

// Prevent duplicate role names/slugs
roleSchema.index(
  { slug: 1 },
  { unique: true }
);

const Roles = mongoose.model("Role", roleSchema);

export default Roles;