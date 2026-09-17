import mongoose from "mongoose";

import Sale from "../models/Sale.js";
import SaleItem from "../models/SaleItem.js";
import SalePayment from "../models/salePayment.js";
import Purchase from "../models/Purchase.js";
import PurchaseItem from "../models/PurchaseItem.js";
import Product from "../models/Product.js";
import ProductInventory from "../models/ProductInventory.js";
import StockMovement from "../models/StockMovement.js";
import Expense from "../models/Expense.js";
import SaleReturn from "../models/SaleReturn.js";
import Customer from "../models/Customer.js";
import Supplier from "../models/Supplier.js";
import CashRegister from "../models/CashRegister.js";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

const toObjectId = (id) => {
  if (!id) return null;

  return new mongoose.Types.ObjectId(id);
};

const getDateRange = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
  };
};

/*
|--------------------------------------------------------------------------
| DASHBOARD REPORT
|--------------------------------------------------------------------------
*/

export const getDashboardReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const dateFilter = {
    $gte: start,
    $lte: end,
  };

  const [
    sales,
    purchases,
    expenses,
    returns,
    lowStock,
    customers,
    suppliers,
  ] = await Promise.all([
    Sale.aggregate([
      {
        $match: {
          business: businessObjectId,
          status: {
            $in: [
              "completed",
              "partially_returned",
              "returned",
            ],
          },
          saleDate: dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalSales: {
            $sum: "$totalAmount",
          },
          totalOrders: {
            $sum: 1,
          },
        },
      },
    ]),

    Purchase.aggregate([
      {
        $match: {
          business: businessObjectId,
          status: {
            $ne: "cancelled",
          },
          purchaseDate: dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalPurchases: {
            $sum: "$totalAmount",
          },
          totalOrders: {
            $sum: 1,
          },
        },
      },
    ]),

    Expense.aggregate([
      {
        $match: {
          business: businessObjectId,
          status: "paid",
          expenseDate: dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalExpenses: {
            $sum: "$amount",
          },
        },
      },
    ]),

    SaleReturn.aggregate([
      {
        $match: {
          business: businessObjectId,
          status: "completed",
          returnDate: dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalReturns: {
            $sum: "$totalAmount",
          },
          totalRefunds: {
            $sum: "$refundAmount",
          },
        },
      },
    ]),

    ProductInventory.aggregate([
      {
        $match: {
          business: businessObjectId,
          isActive: true,
        },
      },
      {
        $match: {
          $expr: {
            $lte: ["$quantity", "$minStock"],
          },
        },
      },
      {
        $count: "count",
      },
    ]),

    Customer.countDocuments({
      business: businessObjectId,
      isActive: true,
    }),

    Supplier.countDocuments({
      business: businessObjectId,
      isActive: true,
    }),
  ]);

  const salesData = sales[0] || {};
  const purchaseData = purchases[0] || {};
  const expenseData = expenses[0] || {};
  const returnData = returns[0] || {};

  const netSales =
    (salesData.totalSales || 0) -
    (returnData.totalReturns || 0);

  return {
    sales: {
      totalSales: salesData.totalSales || 0,
      totalOrders: salesData.totalOrders || 0,
      netSales,
    },

    purchases: {
      totalPurchases:
        purchaseData.totalPurchases || 0,
      totalOrders:
        purchaseData.totalOrders || 0,
    },

    expenses: {
      totalExpenses:
        expenseData.totalExpenses || 0,
    },

    returns: {
      totalReturns:
        returnData.totalReturns || 0,
      totalRefunds:
        returnData.totalRefunds || 0,
    },

    inventory: {
      lowStockProducts:
        lowStock[0]?.count || 0,
    },

    customers: {
      totalCustomers: customers,
    },

    suppliers: {
      totalSuppliers: suppliers,
    },
  };
};

/*
|--------------------------------------------------------------------------
| SALES REPORT
|--------------------------------------------------------------------------
*/

export const getSalesReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const match = {
    business: businessObjectId,
    saleDate: {
      $gte: start,
      $lte: end,
    },
    status: {
      $ne: "cancelled",
    },
  };

  const [
    summary,
    dailySales,
    paymentMethods,
  ] = await Promise.all([
    Sale.aggregate([
      {
        $match: match,
      },
      {
        $group: {
          _id: null,

          totalOrders: {
            $sum: 1,
          },

          grossSales: {
            $sum: "$totalAmount",
          },

          totalDiscount: {
            $sum: "$discount",
          },

          totalTax: {
            $sum: "$tax",
          },

          totalShipping: {
            $sum: "$shippingCost",
          },

          totalOtherCharges: {
            $sum: "$otherCharges",
          },
        },
      },
    ]),

    Sale.aggregate([
      {
        $match: match,
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$saleDate",
            },
          },

          sales: {
            $sum: "$totalAmount",
          },

          orders: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
      {
        $project: {
          _id: 0,
          date: "$_id",
          sales: 1,
          orders: 1,
        },
      },
    ]),

    SalePayment.aggregate([
      {
        $match: {
          business: businessObjectId,
          status: "completed",
          paymentDate: {
            $gte: start,
            $lte: end,
          },
        },
      },
      {
        $group: {
          _id: "$paymentMethod",

          amount: {
            $sum: "$amount",
          },

          count: {
            $sum: 1,
          },
        },
      },
      {
        $sort: {
          amount: -1,
        },
      },
      {
        $project: {
          _id: 0,
          paymentMethod: "$_id",
          amount: 1,
          count: 1,
        },
      },
    ]),
  ]);

  const data = summary[0] || {};

  return {
    summary: {
      totalOrders: data.totalOrders || 0,
      grossSales: data.grossSales || 0,
      totalDiscount: data.totalDiscount || 0,
      totalTax: data.totalTax || 0,
      totalShipping: data.totalShipping || 0,
      totalOtherCharges:
        data.totalOtherCharges || 0,

      averageOrderValue:
        data.totalOrders > 0
          ? data.grossSales / data.totalOrders
          : 0,
    },

    dailySales,

    paymentMethods,
  };
};

/*
|--------------------------------------------------------------------------
| TOP SELLING PRODUCTS
|--------------------------------------------------------------------------
*/

export const getTopSellingProducts = async ({
  businessId,
  startDate,
  endDate,
  limit = 10,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  return SaleItem.aggregate([
    {
      $match: {
        business: businessObjectId,
      },
    },

    {
      $lookup: {
        from: "sales",
        localField: "sale",
        foreignField: "_id",
        as: "sale",
      },
    },

    {
      $unwind: "$sale",
    },

    {
      $match: {
        "sale.status": {
          $ne: "cancelled",
        },

        "sale.saleDate": {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $lookup: {
        from: "products",
        localField: "product",
        foreignField: "_id",
        as: "product",
      },
    },

    {
      $unwind: "$product",
    },

    {
      $group: {
        _id: "$product._id",

        productName: {
          $first: "$product.name",
        },

        sku: {
          $first: "$product.sku",
        },

        totalQuantity: {
          $sum: "$quantity",
        },

        totalSales: {
          $sum: "$lineTotal",
        },
      },
    },

    {
      $sort: {
        totalQuantity: -1,
      },
    },

    {
      $limit: Number(limit),
    },

    {
      $project: {
        _id: 1,
        productName: 1,
        sku: 1,
        totalQuantity: 1,
        totalSales: 1,
      },
    },
  ]);
};

/*
|--------------------------------------------------------------------------
| PURCHASE REPORT
|--------------------------------------------------------------------------
*/

export const getPurchaseReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const [summary, dailyPurchases] =
    await Promise.all([
      Purchase.aggregate([
        {
          $match: {
            business: businessObjectId,
            status: {
              $ne: "cancelled",
            },
            purchaseDate: {
              $gte: start,
              $lte: end,
            },
          },
        },

        {
          $group: {
            _id: null,

            totalPurchases: {
              $sum: "$totalAmount",
            },

            totalOrders: {
              $sum: 1,
            },

            totalPaid: {
              $sum: "$paidAmount",
            },

            totalDue: {
              $sum: "$dueAmount",
            },
          },
        },
      ]),

      Purchase.aggregate([
        {
          $match: {
            business: businessObjectId,
            status: {
              $ne: "cancelled",
            },
            purchaseDate: {
              $gte: start,
              $lte: end,
            },
          },
        },

        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$purchaseDate",
              },
            },

            amount: {
              $sum: "$totalAmount",
            },

            orders: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            _id: 1,
          },
        },

        {
          $project: {
            _id: 0,
            date: "$_id",
            amount: 1,
            orders: 1,
          },
        },
      ]),
    ]);

  const data = summary[0] || {};

  return {
    summary: {
      totalPurchases:
        data.totalPurchases || 0,

      totalOrders:
        data.totalOrders || 0,

      totalPaid:
        data.totalPaid || 0,

      totalDue:
        data.totalDue || 0,
    },

    dailyPurchases,
  };
};

/*
|--------------------------------------------------------------------------
| INVENTORY REPORT
|--------------------------------------------------------------------------
*/

export const getInventoryReport = async ({
  businessId,
}) => {
  const businessObjectId = toObjectId(businessId);

  const [
    summary,
    lowStock,
    outOfStock,
  ] = await Promise.all([
    ProductInventory.aggregate([
      {
        $match: {
          business: businessObjectId,
          isActive: true,
        },
      },

      {
        $group: {
          _id: null,

          totalQuantity: {
            $sum: "$quantity",
          },

          inventoryCostValue: {
            $sum: {
              $multiply: [
                "$quantity",
                "$purchasePrice",
              ],
            },
          },

          inventorySaleValue: {
            $sum: {
              $multiply: [
                "$quantity",
                "$salePrice",
              ],
            },
          },
        },
      },
    ]),

    ProductInventory.aggregate([
      {
        $match: {
          business: businessObjectId,
          isActive: true,
        },
      },

      {
        $match: {
          $expr: {
            $lte: [
              "$quantity",
              "$minStock",
            ],
          },
        },
      },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },

      {
        $unwind: "$product",
      },

      {
        $sort: {
          quantity: 1,
        },
      },

      {
        $project: {
          _id: 1,
          product: "$product.name",
          sku: "$product.sku",
          quantity: 1,
          minStock: 1,
          salePrice: 1,
        },
      },
    ]),

    ProductInventory.aggregate([
      {
        $match: {
          business: businessObjectId,
          isActive: true,
          quantity: 0,
        },
      },

      {
        $lookup: {
          from: "products",
          localField: "product",
          foreignField: "_id",
          as: "product",
        },
      },

      {
        $unwind: "$product",
      },

      {
        $project: {
          _id: 1,
          product: "$product.name",
          sku: "$product.sku",
        },
      },
    ]),
  ]);

  const data = summary[0] || {};

  return {
    summary: {
      totalQuantity:
        data.totalQuantity || 0,

      inventoryCostValue:
        data.inventoryCostValue || 0,

      inventorySaleValue:
        data.inventorySaleValue || 0,

      potentialProfit:
        (data.inventorySaleValue || 0) -
        (data.inventoryCostValue || 0),
    },

    lowStock,

    outOfStock,
  };
};

/*
|--------------------------------------------------------------------------
| EXPENSE REPORT
|--------------------------------------------------------------------------
*/

export const getExpenseReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const match = {
    business: businessObjectId,
    status: "paid",
    expenseDate: {
      $gte: start,
      $lte: end,
    },
  };

  const [
    summary,
    categories,
    paymentMethods,
  ] = await Promise.all([
    Expense.aggregate([
      {
        $match: match,
      },

      {
        $group: {
          _id: null,

          totalExpenses: {
            $sum: "$amount",
          },

          totalTransactions: {
            $sum: 1,
          },
        },
      },
    ]),

    Expense.aggregate([
      {
        $match: match,
      },

      {
        $lookup: {
          from: "expensecategories",
          localField: "expenseCategory",
          foreignField: "_id",
          as: "category",
        },
      },

      {
        $unwind: "$category",
      },

      {
        $group: {
          _id: "$category._id",

          categoryName: {
            $first: "$category.name",
          },

          amount: {
            $sum: "$amount",
          },

          transactions: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          amount: -1,
        },
      },

      {
        $project: {
          _id: 1,
          categoryName: 1,
          amount: 1,
          transactions: 1,
        },
      },
    ]),

    Expense.aggregate([
      {
        $match: match,
      },

      {
        $group: {
          _id: "$paymentMethod",

          amount: {
            $sum: "$amount",
          },

          transactions: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          amount: -1,
        },
      },

      {
        $project: {
          _id: 0,
          paymentMethod: "$_id",
          amount: 1,
          transactions: 1,
        },
      },
    ]),
  ]);

  const data = summary[0] || {};

  return {
    summary: {
      totalExpenses:
        data.totalExpenses || 0,

      totalTransactions:
        data.totalTransactions || 0,
    },

    categories,

    paymentMethods,
  };
};

/*
|--------------------------------------------------------------------------
| CUSTOMER REPORT
|--------------------------------------------------------------------------
*/

export const getCustomerReport = async ({
  businessId,
  startDate,
  endDate,
  limit = 10,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  return Sale.aggregate([
    {
      $match: {
        business: businessObjectId,
        customer: {
          $ne: null,
        },
        status: {
          $ne: "cancelled",
        },
        saleDate: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: "$customer",

        totalPurchases: {
          $sum: "$totalAmount",
        },

        totalOrders: {
          $sum: 1,
        },

        totalDue: {
          $sum: "$dueAmount",
        },
      },
    },

    {
      $lookup: {
        from: "customers",
        localField: "_id",
        foreignField: "_id",
        as: "customer",
      },
    },

    {
      $unwind: "$customer",
    },

    {
      $sort: {
        totalPurchases: -1,
      },
    },

    {
      $limit: Number(limit),
    },

    {
      $project: {
        _id: 0,

        customerId: "$customer._id",

        customerName: "$customer.name",

        phone: "$customer.phone",

        totalPurchases: 1,

        totalOrders: 1,

        totalDue: 1,
      },
    },
  ]);
};

/*
|--------------------------------------------------------------------------
| SUPPLIER REPORT
|--------------------------------------------------------------------------
*/

export const getSupplierReport = async ({
  businessId,
  startDate,
  endDate,
  limit = 10,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  return Purchase.aggregate([
    {
      $match: {
        business: businessObjectId,
        supplier: {
          $ne: null,
        },
        status: {
          $ne: "cancelled",
        },
        purchaseDate: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: "$supplier",

        totalPurchases: {
          $sum: "$totalAmount",
        },

        totalOrders: {
          $sum: 1,
        },

        totalDue: {
          $sum: "$dueAmount",
        },
      },
    },

    {
      $lookup: {
        from: "suppliers",
        localField: "_id",
        foreignField: "_id",
        as: "supplier",
      },
    },

    {
      $unwind: "$supplier",
    },

    {
      $sort: {
        totalPurchases: -1,
      },
    },

    {
      $limit: Number(limit),
    },

    {
      $project: {
        _id: 0,

        supplierId: "$supplier._id",

        supplierName: "$supplier.name",

        phone: "$supplier.phone",

        totalPurchases: 1,

        totalOrders: 1,

        totalDue: 1,
      },
    },
  ]);
};

/*
|--------------------------------------------------------------------------
| STOCK MOVEMENT REPORT
|--------------------------------------------------------------------------
*/

export const getStockMovementReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const summary = await StockMovement.aggregate([
    {
      $match: {
        business: businessObjectId,
        createdAt: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: "$movementType",

        totalQuantity: {
          $sum: "$quantity",
        },

        transactions: {
          $sum: 1,
        },
      },
    },

    {
      $project: {
        _id: 0,

        movementType: "$_id",

        totalQuantity: 1,

        transactions: 1,
      },
    },
  ]);

  const byReference = await StockMovement.aggregate([
    {
      $match: {
        business: businessObjectId,
        createdAt: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: "$referenceType",

        quantity: {
          $sum: "$quantity",
        },

        transactions: {
          $sum: 1,
        },
      },
    },

    {
      $sort: {
        quantity: -1,
      },
    },

    {
      $project: {
        _id: 0,

        referenceType: "$_id",

        quantity: 1,

        transactions: 1,
      },
    },
  ]);

  return {
    summary,
    byReference,
  };
};

/*
|--------------------------------------------------------------------------
| PAYMENT REPORT
|--------------------------------------------------------------------------
*/

export const getPaymentReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const [summary, methods, statuses] =
    await Promise.all([
      SalePayment.aggregate([
        {
          $match: {
            business: businessObjectId,
            paymentDate: {
              $gte: start,
              $lte: end,
            },
          },
        },

        {
          $group: {
            _id: null,

            totalAmount: {
              $sum: "$amount",
            },

            totalTransactions: {
              $sum: 1,
            },
          },
        },
      ]),

      SalePayment.aggregate([
        {
          $match: {
            business: businessObjectId,
            status: "completed",
            paymentDate: {
              $gte: start,
              $lte: end,
            },
          },
        },

        {
          $group: {
            _id: "$paymentMethod",

            amount: {
              $sum: "$amount",
            },

            transactions: {
              $sum: 1,
            },
          },
        },

        {
          $sort: {
            amount: -1,
          },
        },

        {
          $project: {
            _id: 0,
            paymentMethod: "$_id",
            amount: 1,
            transactions: 1,
          },
        },
      ]),

      SalePayment.aggregate([
        {
          $match: {
            business: businessObjectId,
            paymentDate: {
              $gte: start,
              $lte: end,
            },
          },
        },

        {
          $group: {
            _id: "$status",

            amount: {
              $sum: "$amount",
            },

            transactions: {
              $sum: 1,
            },
          },
        },

        {
          $project: {
            _id: 0,
            status: "$_id",
            amount: 1,
            transactions: 1,
          },
        },
      ]),
    ]);

  return {
    summary: summary[0] || {
      totalAmount: 0,
      totalTransactions: 0,
    },

    methods,

    statuses,
  };
};

/*
|--------------------------------------------------------------------------
| CASH REGISTER REPORT
|--------------------------------------------------------------------------
*/

export const getCashRegisterReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const registers = await CashRegister.find({
    business: businessObjectId,
    openedAt: {
      $gte: start,
      $lte: end,
    },
  })
    .populate("user", "name email")
    .populate("openedBy", "name email")
    .populate("closedBy", "name email")
    .sort({
      openedAt: -1,
    })
    .lean();

  const summary = registers.reduce(
    (result, register) => {
      result.totalOpeningBalance +=
        register.openingBalance || 0;

      result.totalCashSales +=
        register.cashSales || 0;

      result.totalCashExpenses +=
        register.cashExpenses || 0;

      result.totalCashRefunds +=
        register.cashRefunds || 0;

      result.totalCashIn +=
        register.cashIn || 0;

      result.totalCashOut +=
        register.cashOut || 0;

      result.totalDifference +=
        register.difference || 0;

      return result;
    },
    {
      totalOpeningBalance: 0,
      totalCashSales: 0,
      totalCashExpenses: 0,
      totalCashRefunds: 0,
      totalCashIn: 0,
      totalCashOut: 0,
      totalDifference: 0,
    }
  );

  return {
    summary,
    registers,
  };
};

/*
|--------------------------------------------------------------------------
| PROFIT & LOSS REPORT
|--------------------------------------------------------------------------
*/

export const getProfitLossReport = async ({
  businessId,
  startDate,
  endDate,
}) => {
  const businessObjectId = toObjectId(businessId);

  const { start, end } = getDateRange(
    startDate,
    endDate
  );

  const sales = await Sale.aggregate([
    {
      $match: {
        business: businessObjectId,
        status: {
          $ne: "cancelled",
        },
        saleDate: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: null,

        revenue: {
          $sum: "$totalAmount",
        },
      },
    },
  ]);

  const expenses = await Expense.aggregate([
    {
      $match: {
        business: businessObjectId,
        status: "paid",
        expenseDate: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: null,

        totalExpenses: {
          $sum: "$amount",
        },
      },
    },
  ]);

  const purchases = await Purchase.aggregate([
    {
      $match: {
        business: businessObjectId,
        status: {
          $ne: "cancelled",
        },
        purchaseDate: {
          $gte: start,
          $lte: end,
        },
      },
    },

    {
      $group: {
        _id: null,

        totalPurchases: {
          $sum: "$totalAmount",
        },
      },
    },
  ]);

  const revenue = sales[0]?.revenue || 0;

  const totalPurchases =
    purchases[0]?.totalPurchases || 0;

  const totalExpenses =
    expenses[0]?.totalExpenses || 0;

  const grossProfit =
    revenue - totalPurchases;

  const netProfit =
    grossProfit - totalExpenses;

  return {
    revenue,

    costOfGoodsSold: totalPurchases,

    grossProfit,

    operatingExpenses: totalExpenses,

    netProfit,

    grossProfitMargin:
      revenue > 0
        ? (grossProfit / revenue) * 100
        : 0,

    netProfitMargin:
      revenue > 0
        ? (netProfit / revenue) * 100
        : 0,
  };
};