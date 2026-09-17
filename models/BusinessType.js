import mongoose from "mongoose";

const businessTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Business type name is required"],
            trim: true,
        },

        business: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Business",
            required: [true, "Business is required"],
        },

        description: {
            type: String,
            trim: true,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

businessTypeSchema.index(
    { business: 1, name: 1 },
    { unique: true }
);

const BusinessType = mongoose.model("BusinessType", businessTypeSchema);

export default BusinessType;