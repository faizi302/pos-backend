import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        // =====================================================
        // BASIC USER INFORMATION
        // =====================================================

        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [100, "Name cannot exceed 100 characters"],
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
        },

        phone: {
            type: String,
            trim: true,
            maxlength: [30, "Phone number cannot exceed 30 characters"],
        },

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [6, "Password must be at least 6 characters"],
            select: false,
        },

        // =====================================================
        // PROFILE
        // =====================================================

        avatar: {
            url: {
                type: String,
                trim: true,
                default: null,
            },

            publicId: {
                type: String,
                trim: true,
                default: null,
            },
        },

        // Business / Admin Logo
        logo: {
            url: {
                type: String,
                trim: true,
                default: null,
            },

            publicId: {
                type: String,
                trim: true,
                default: null,
            },
        },

        country: {
            type: String,
            trim: true,
            maxlength: [100, "Country cannot exceed 100 characters"],
            default: null,
        },

        city: {
            type: String,
            trim: true,
            maxlength: [100, "City cannot exceed 100 characters"],
            default: null,
        },

        address: {
            type: String,
            trim: true,
            maxlength: [500, "Address cannot exceed 500 characters"],
            default: null,
        },

        // =====================================================
        // ROLE
        // =====================================================

        role: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Role",
            required: [true, "User role is required"],
            index: true,
        },

        // =====================================================
        // BUSINESS
        // =====================================================

        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            // required: [true, "User business is required"],
            default: null,
            index: true,
        },

        businessType: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BusinessType",
            //  required: [true, "BusinessType role is required"],
            default: null,
            index: true,
        },

        // =====================================================
        // USER OWNERSHIP
        // =====================================================
        //
        // Admin:
        // createdBy = null
        //
        // Manager:
        // createdBy = Admin._id
        //
        // Example:
        //
        // Admin A
        //    ↓
        // Manager A1
        // Manager A2
        //
        // Admin B
        //    ↓
        // Manager B1
        //
        // =====================================================

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },

        // =====================================================
        // ACCOUNT STATUS
        // =====================================================
        //
        // active     = Approved
        // pending    = Pending
        // rejected   = Rejected
        // suspended  = Blocked
        //
        // Only active users can login.
        //
        // =====================================================

        status: {
            type: String,
            enum: [
                "active",
                "pending",
                "rejected",
                "suspended",
            ],
            default: "active",
            index: true,
        },

        // =====================================================
        // EMAIL VERIFICATION
        // =====================================================

        isEmailVerified: {
            type: Boolean,
            default: false,
        },

        // =====================================================
        // LAST LOGIN
        // =====================================================

        lastLoginAt: {
            type: Date,
            default: null,
        },

        // =====================================================
        // FORGOT PASSWORD / OTP
        // =====================================================

        resetOtp: {
            type: String,
            select: false,
        },

        resetOtpExpiresAt: {
            type: Date,
            select: false,
        },

        resetOtpAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

        // =====================================================
        // PASSWORD RESET TOKEN
        // =====================================================

        resetToken: {
            type: String,
            select: false,
        },

        resetTokenExpiresAt: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// =====================================================
// COMPOUND INDEX
// =====================================================
//
// This is important for:
//
// User.find({
//     role: managerRole._id,
//     createdBy: adminId,
// });
//
// It efficiently finds managers belonging
// to a particular Admin.
//
// =====================================================

userSchema.index({
    role: 1,
    createdBy: 1,
});

// =====================================================
// MODEL
// =====================================================

const User = mongoose.model("User", userSchema);

export default User;