import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";

import {
  getDashboardReport,
  getSalesReport,
  getTopSellingProducts,
  getPurchaseReport,
  getInventoryReport,
  getExpenseReport,
  getCustomerReport,
  getSupplierReport,
  getStockMovementReport,
  getPaymentReport,
  getCashRegisterReport,
  getProfitLossReport,
} from "../services/reportServices.js";

const SUPER_ADMIN_ROLE = "super-admin";

/*
|--------------------------------------------------------------------------
| Business Resolver
|--------------------------------------------------------------------------
*/

const getBusinessId = (req) => {
  if (req.user?.role?.slug === SUPER_ADMIN_ROLE) {
    return (
      req.query.business ||
      req.body?.business ||
      null
    );
  }

  return req.user?.business || null;
};

/*
|--------------------------------------------------------------------------
| Date Resolver
|--------------------------------------------------------------------------
*/

const getReportDates = (req) => {
  const today = new Date();

  const defaultStart = new Date(today);
  defaultStart.setDate(
    defaultStart.getDate() - 30
  );

  const startDate =
    req.query.startDate ||
    defaultStart.toISOString();

  const endDate =
    req.query.endDate ||
    today.toISOString();

  return {
    startDate,
    endDate,
  };
};

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

export const getDashboard = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getDashboardReport({
      businessId,
      startDate,
      endDate,
    });

    return successResponse(
      res,
      200,
      "Dashboard report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| SALES
|--------------------------------------------------------------------------
*/

export const getSales = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getSalesReport({
      businessId,
      startDate,
      endDate,
    });

    return successResponse(
      res,
      200,
      "Sales report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| TOP PRODUCTS
|--------------------------------------------------------------------------
*/

export const getTopProducts = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getTopSellingProducts({
      businessId,
      startDate,
      endDate,
      limit: req.query.limit || 10,
    });

    return successResponse(
      res,
      200,
      "Top selling products fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| PURCHASES
|--------------------------------------------------------------------------
*/

export const getPurchases = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getPurchaseReport({
      businessId,
      startDate,
      endDate,
    });

    return successResponse(
      res,
      200,
      "Purchase report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| INVENTORY
|--------------------------------------------------------------------------
*/

export const getInventory = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const data = await getInventoryReport({
      businessId,
    });

    return successResponse(
      res,
      200,
      "Inventory report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| EXPENSES
|--------------------------------------------------------------------------
*/

export const getExpenses = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getExpenseReport({
      businessId,
      startDate,
      endDate,
    });

    return successResponse(
      res,
      200,
      "Expense report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| CUSTOMERS
|--------------------------------------------------------------------------
*/

export const getCustomers = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getCustomerReport({
      businessId,
      startDate,
      endDate,
      limit: req.query.limit || 10,
    });

    return successResponse(
      res,
      200,
      "Customer report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| SUPPLIERS
|--------------------------------------------------------------------------
*/

export const getSuppliers = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getSupplierReport({
      businessId,
      startDate,
      endDate,
      limit: req.query.limit || 10,
    });

    return successResponse(
      res,
      200,
      "Supplier report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| STOCK MOVEMENTS
|--------------------------------------------------------------------------
*/

export const getStockMovements = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data =
      await getStockMovementReport({
        businessId,
        startDate,
        endDate,
      });

    return successResponse(
      res,
      200,
      "Stock movement report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| PAYMENTS
|--------------------------------------------------------------------------
*/

export const getPayments = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data = await getPaymentReport({
      businessId,
      startDate,
      endDate,
    });

    return successResponse(
      res,
      200,
      "Payment report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| CASH REGISTER
|--------------------------------------------------------------------------
*/

export const getCashRegister = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data =
      await getCashRegisterReport({
        businessId,
        startDate,
        endDate,
      });

    return successResponse(
      res,
      200,
      "Cash register report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};

/*
|--------------------------------------------------------------------------
| PROFIT & LOSS
|--------------------------------------------------------------------------
*/

export const getProfitLoss = async (
  req,
  res,
  next
) => {
  try {
    const businessId = getBusinessId(req);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }

    const { startDate, endDate } =
      getReportDates(req);

    const data =
      await getProfitLossReport({
        businessId,
        startDate,
        endDate,
      });

    return successResponse(
      res,
      200,
      "Profit and loss report fetched successfully.",
      data
    );
  } catch (error) {
    next(error);
  }
};