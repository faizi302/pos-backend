import mongoose from "mongoose";

const cashRegisterSchema = new mongoose.Schema(
    {
        // ==========================================
        // TENANT OWNER
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
        // Tenant isolation is controlled by tenantOwner.
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
        // User operating this register.
        //
        // Allowed:
        // - Admin
        // - Manager
        //
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Cash register user is required."],
            index: true,
        },

        // ==========================================
        // REGISTER NUMBER
        // ==========================================
        //
        // Example:
        // REG-000001
        // REG-000002
        //
        // IMPORTANT:
        // registerNumber is NOT globally unique.
        //
        // It is unique only together with tenantOwner.
        //
        // Tenant A:
        //   REG-000001
        //
        // Tenant B:
        //   REG-000001
        //
        // This is allowed.
        //
        registerNumber: {
            type: String,
            required: [true, "Register number is required."],
            trim: true,
            uppercase: true,
        },

        // ==========================================
        // OPEN / CLOSE TIME
        // ==========================================

        openedAt: {
            type: Date,
            required: [true, "Opening time is required."],
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

        openingBalance: {
            type: Number,
            required: [true, "Opening balance is required."],
            min: [0, "Opening balance cannot be negative."],
            default: 0,
        },

        // ==========================================
        // CASH SALES
        // ==========================================

        cashSales: {
            type: Number,
            min: [0, "Cash sales cannot be negative."],
            default: 0,
        },

        // ==========================================
        // CASH EXPENSES
        // ==========================================

        cashExpenses: {
            type: Number,
            min: [0, "Cash expenses cannot be negative."],
            default: 0,
        },

        // ==========================================
        // CASH REFUNDS
        // ==========================================

        cashRefunds: {
            type: Number,
            min: [0, "Cash refunds cannot be negative."],
            default: 0,
        },

        // ==========================================
        // CASH IN
        // ==========================================

        cashIn: {
            type: Number,
            min: [0, "Cash in cannot be negative."],
            default: 0,
        },

        // ==========================================
        // CASH OUT
        // ==========================================

        cashOut: {
            type: Number,
            min: [0, "Cash out cannot be negative."],
            default: 0,
        },

        // ==========================================
        // EXPECTED CLOSING BALANCE
        // ==========================================
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

        actualClosingBalance: {
            type: Number,
            min: 0,
            default: null,
        },

        // ==========================================
        // DIFFERENCE
        // ==========================================
        //
        // actualClosingBalance
        // - expectedClosingBalance
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
            required: [true, "Opened by is required."],
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
// IMPORTANT:
//
// This is intentionally NOT:
//
// registerNumber: { unique: true }
//
// Because register numbers are allowed to repeat
// between different tenants.
//
// Tenant A:
//   tenantOwner = A
//   REG-000001
//
// Tenant B:
//   tenantOwner = B
//   REG-000001
//
// Both are valid.
//
// But:
//
// Tenant A:
//   REG-000001
//   REG-000001
//
// is NOT valid.
//
// ======================================================

cashRegisterSchema.index(
    {
        tenantOwner: 1,
        registerNumber: 1,
    },
    
);

// ======================================================
// TENANT + STATUS + OPENED AT
// ======================================================

cashRegisterSchema.index({
    tenantOwner: 1,
    status: 1,
    openedAt: -1,
});

// ======================================================
// TENANT + USER + OPENED AT
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