import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
    {
        // ================================================
        // BUSINESS / TENANT
        // ================================================

        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: true,
            index: true,
        },

        businessType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessType",
            required: true,
            index: true,
        },

        // ================================================
        // CUSTOMER INFORMATION
        // ================================================

        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 150,
        },

        phone: {
            type: String,
            trim: true,
            maxlength: 30,
            default: "",
        },

        alternatePhone: {
            type: String,
            trim: true,
            maxlength: 30,
            default: "",
        },

        email: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 150,
            default: "",
        },

        // ================================================
        // ADDRESS
        // ================================================

        address: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },

        city: {
            type: String,
            trim: true,
            maxlength: 100,
            default: "",
        },

        country: {
            type: String,
            trim: true,
            maxlength: 100,
            default: "Pakistan",
        },

        // ================================================
        // CUSTOMER ACCOUNT / CREDIT
        // ================================================

        openingBalance: {
            type: Number,
            min: 0,
            default: 0,
        },

        creditLimit: {
            type: Number,
            min: 0,
            default: 0,
        },

        // ================================================
        // CUSTOMER STATUS
        // ================================================

        isActive: {
            type: Boolean,
            default: true,
        },

        // ================================================
        // NOTES
        // ================================================

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        // ================================================
        // AUDIT
        // ================================================

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

// ====================================================
// INDEXES
// ====================================================

// Same customer name can exist in different
// Business + BusinessType tenants.
//
// Example:
// Information Technology + Mobiles + Ali
// Information Technology + Laptops + Ali
// are both allowed.
//
// But duplicate Ali inside the same tenant
// is not allowed.
customerSchema.index(
    {
        business: 1,
        businessType: 1,
        name: 1,
    },
    {
        unique: true,
    }
);

customerSchema.index({
    business: 1,
    businessType: 1,
    isActive: 1,
});

customerSchema.index({
    business: 1,
    businessType: 1,
    phone: 1,
});

customerSchema.index({
    business: 1,
    businessType: 1,
    email: 1,
});

const Customer = mongoose.model(
    "Customer",
    customerSchema
);

export default Customer;