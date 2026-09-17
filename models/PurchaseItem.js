import mongoose from "mongoose";

const purchaseItemSchema = new mongoose.Schema(
  {
    // Business / Tenant
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
      index: true,
    },

    // Purchase this item belongs to
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Purchase",
      required: true,
      index: true,
    },

    // Main product
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    // Specific inventory / variant
    // Example:
    // iPhone 15 + Black + 128GB
    productInventory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductInventory",
      required: true,
      index: true,
    },

    // Ordered quantity
    quantity: {
      type: Number,
      required: true,
      min: 0.001,
    },

    // Quantity actually received
    receivedQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Purchase price per unit
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Total before discount/tax
    lineSubtotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Discount amount for this line
    discount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Tax amount for this line
    tax: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Final amount for this purchase item
    lineTotal: {
      type: Number,
      min: 0,
      default: 0,
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

// All items of a purchase
purchaseItemSchema.index({
  business: 1,
  purchase: 1,
});

// Product purchase history
purchaseItemSchema.index({
  business: 1,
  product: 1,
});

// Product inventory / variant purchase history
purchaseItemSchema.index({
  business: 1,
  productInventory: 1,
});

// Prevent the same inventory variant from being added
// twice to the same purchase.
purchaseItemSchema.index(
  {
    purchase: 1,
    productInventory: 1,
  },
  {
    unique: true,
  }
);

const PurchaseItem = mongoose.model(
  "PurchaseItem",
  purchaseItemSchema
);

export default PurchaseItem;