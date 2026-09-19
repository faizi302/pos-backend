import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
    {
        // ================================================
        // TENANT / BUSINESS
        // ================================================

        // The Admin account that owns this customer.
        // This is the actual tenant isolation field.
        //
        // Admin A and Admin B can both have:
        // IT + Mobiles + Ali
        // but their tenantOwner will be different.
        tenantOwner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // Business classification
        // This does NOT provide tenant isolation.
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

// Customer name is unique INSIDE the same tenant,
// business and business type.
//
// Admin A:
// tenantOwner = Admin A
// business = IT
// businessType = Mobiles
// name = Ali
//
// Admin B:
// tenantOwner = Admin B
// business = IT
// businessType = Mobiles
// name = Ali
//
// Both are allowed because tenantOwner is different.
customerSchema.index(
    {
        tenantOwner: 1,
        business: 1,
        businessType: 1,
        name: 1,
    },
    {
        unique: true,
    }
);

// Active customers inside a tenant
customerSchema.index({
    tenantOwner: 1,
    business: 1,
    businessType: 1,
    isActive: 1,
});

// Phone search inside a tenant
customerSchema.index({
    tenantOwner: 1,
    business: 1,
    businessType: 1,
    phone: 1,
});

// Email search inside a tenant
customerSchema.index({
    tenantOwner: 1,
    business: 1,
    businessType: 1,
    email: 1,
});

const Customer = mongoose.model(
    "Customer",
    customerSchema
);

export default Customer;