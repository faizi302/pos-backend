import mongoose from "mongoose";

const productSequenceSchema = new mongoose.Schema(
  {
    tenantOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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
    counter: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

productSequenceSchema.index(
  { tenantOwner: 1, business: 1, businessType: 1 },
  { unique: true, name: "tenantOwner_1_business_1_businessType_1" }
);

const ProductSequence = mongoose.model("ProductSequence", productSequenceSchema);

export default ProductSequence;