import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    // Business / Tenant
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Supplier name
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // Company / shop name
    companyName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },

    // Primary phone
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },

    // Alternative phone
    alternatePhone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },

    // Email
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 150,
      default: "",
    },

    // Address
    address: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // City
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    // Country
    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Pakistan",
    },

    // Tax / NTN / GST number
    taxNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    // Initial amount owed to supplier
    openingBalance: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Maximum credit allowed by supplier
    creditLimit: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Supplier payment terms
    paymentTerms: {
      type: String,
      enum: [
        "cash",
        "7_days",
        "15_days",
        "30_days",
        "45_days",
        "60_days",
        "custom",
      ],
      default: "cash",
    },

    // Additional supplier information
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    // Soft delete / active state
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Audit fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);


/*
|--------------------------------------------------------------------------
| Indexes
|--------------------------------------------------------------------------
*/

// Same supplier name can exist in different businesses,
// but not twice inside the same business.
supplierSchema.index(
  {
    business: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// Quickly find active suppliers of a business.
supplierSchema.index({
  business: 1,
  isActive: 1,
});

// Useful for phone-based supplier search.
supplierSchema.index({
  business: 1,
  phone: 1,
});


const Supplier = mongoose.model(
  "Supplier",
  supplierSchema
);

export default Supplier;