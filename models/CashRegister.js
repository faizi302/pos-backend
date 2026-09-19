
import mongoose from "mongoose";

const cashRegisterSchema = new mongoose.Schema(
    {
        // ==========================================
        // TENANT
        // ==========================================
        // The Admin who owns this cash register.
        //
        // Admin A:
        // tenantOwner = Admin A
        //
        // Admin B:
        // tenantOwner = Admin B
        //
        // Even if both Admins belong to the same
        // Business, their cash registers remain
        // completely isolated.
        //
        tenantOwner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Tenant owner is required."],
            index: true,
        },

        // ==========================================
        // BUSINESS
        // ==========================================
        // Business is the classification/context.
        // It is NOT the tenant boundary.
        //
        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: [true, "Business is required."],
            index: true,
        },

        // ==========================================
        // REGISTER USER
        // ==========================================
        // The user/cashier operating this register.
        //
        // This can be:
        // Admin
        // Manager
        // or another allowed user depending on
        // your application rules.
        //
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [
                true,
                "Cash register user is required.",
            ],
            index: true,
        },

        // ==========================================
        // REGISTER NUMBER
        // ==========================================
        //
        // Example:
        // REG-001
        // REG-002
        // MAIN-REGISTER
        //
        // Unique per tenant, NOT globally.
        //
        registerNumber: {
            type: String,
            required: [
                true,
                "Register number is required.",
            ],
            trim: true,
            uppercase: true,
        },

        // ==========================================
        // OPEN / CLOSE TIME
        // ==========================================

        openedAt: {
            type: Date,
            required: [
                true,
                "Opening time is required.",
            ],
            default: Date.now,
            index: true,
        },

        closedAt: {
            type: Date,
            default: null,
        },

        // ==========================================
        // REGISTER STATUS
        // ==========================================

        status: {
            type: String,
            enum: ["open", "closed"],
            default: "open",
            index: true,
        },

        // ==========================================
        // OPENING BALANCE
        // ==========================================
        // Physical cash available when the register
        // is opened.
        //
        openingBalance: {
            type: Number,
            required: [
                true,
                "Opening balance is required.",
            ],
            min: [
                0,
                "Opening balance cannot be negative.",
            ],
            default: 0,
        },

        // ==========================================
        // CASH SALES
        // ==========================================
        // Cash received from customer sales.
        //
        cashSales: {
            type: Number,
            min: [
                0,
                "Cash sales cannot be negative.",
            ],
            default: 0,
        },

        // ==========================================
        // CASH EXPENSES
        // ==========================================
        // Cash paid for business expenses.
        //
        cashExpenses: {
            type: Number,
            min: [
                0,
                "Cash expenses cannot be negative.",
            ],
            default: 0,
        },

        // ==========================================
        // CASH REFUNDS
        // ==========================================
        // Cash returned to customers.
        //
        cashRefunds: {
            type: Number,
            min: [
                0,
                "Cash refunds cannot be negative.",
            ],
            default: 0,
        },

        // ==========================================
        // CASH IN
        // ==========================================
        // Extra cash manually added to register.
        //
        cashIn: {
            type: Number,
            min: [
                0,
                "Cash in cannot be negative.",
            ],
            default: 0,
        },

        // ==========================================
        // CASH OUT
        // ==========================================
        // Cash manually removed from register.
        //
        cashOut: {
            type: Number,
            min: [
                0,
                "Cash out cannot be negative.",
            ],
            default: 0,
        },

        // ==========================================
        // EXPECTED CLOSING BALANCE
        // ==========================================
        // Backend calculated value.
        //
        // Formula:
        //
        // openingBalance
        // + cashSales
        // + cashIn
        // - cashExpenses
        // - cashRefunds
        // - cashOut
        //
        expectedClosingBalance: {
            type: Number,
            min: 0,
            default: 0,
        },

        // ==========================================
        // ACTUAL CLOSING BALANCE
        // ==========================================
        // Physical cash counted by cashier.
        //
        actualClosingBalance: {
            type: Number,
            min: 0,
            default: null,
        },

        // ==========================================
        // DIFFERENCE
        // ==========================================
        // Formula:
        //
        // actualClosingBalance
        // -
        // expectedClosingBalance
        //
        difference: {
            type: Number,
            default: null,
        },

        // ==========================================
        // NOTES
        // ==========================================

        notes: {
            type: String,
            trim: true,
            maxlength: 1000,
            default: "",
        },

        // ==========================================
        // AUDIT - OPENED BY
        // ==========================================

        openedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [
                true,
                "Opened by is required.",
            ],
        },

        // ==========================================
        // AUDIT - CLOSED BY
        // ==========================================

        closedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// ======================================================
// UNIQUE REGISTER NUMBER PER TENANT
// ======================================================
//
// Tenant A:
//   REG-001
//   REG-002
//
// Tenant B:
//   REG-001
//   REG-002
//
// This is allowed.
//
// But inside Tenant A:
//
//   REG-001
//   REG-001
//
// is NOT allowed.
//
// ======================================================

cashRegisterSchema.index(
    {
        tenantOwner: 1,
        registerNumber: 1,
    },
    {
        unique: true,
        name: "tenantOwner_1_registerNumber_1",
    }
);

// ======================================================
// TENANT + STATUS + OPENED AT
// ======================================================
//
// Useful for:
// - getting open registers
// - register history
// - tenant-specific register listing
//
// ======================================================

cashRegisterSchema.index({
    tenantOwner: 1,
    status: 1,
    openedAt: -1,
});

// ======================================================
// TENANT + USER + OPENED AT
// ======================================================
//
// Useful for:
// - finding registers operated by a user
// - register history for a cashier
//
// ======================================================

cashRegisterSchema.index({
    tenantOwner: 1,
    user: 1,
    openedAt: -1,
});

// ======================================================
// TENANT + BUSINESS
// ======================================================

cashRegisterSchema.index({
    tenantOwner: 1,
    business: 1,
});

// ======================================================
// TENANT + OPENED BY
// ======================================================

cashRegisterSchema.index({
    tenantOwner: 1,
    openedBy: 1,
});

// ======================================================
// TENANT + CLOSED BY
// ======================================================

cashRegisterSchema.index({
    tenantOwner: 1,
    closedBy: 1,
});

// ======================================================
// MODEL
// ======================================================

const CashRegister = mongoose.model(
    "CashRegister",
    cashRegisterSchema
);

export default CashRegister;
