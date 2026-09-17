import mongoose from "mongoose";

const businessSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Business name is required"],
            trim: true,
            unique: true,
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

const Business = mongoose.model("Business", businessSchema);

export default Business;