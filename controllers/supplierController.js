import mongoose from "mongoose";

import Supplier from "../models/Supplier.js";
import Business from "../models/Business.js";

import {
  errorResponse,
  successResponse,
} from "../utils/apiResponse.js";


/*
|--------------------------------------------------------------------------
| Helper Functions
|--------------------------------------------------------------------------
*/

const getUserRole = (req) => {
  return req.user?.role?.slug || "";
};


const isSuperAdmin = (req) => {
  return getUserRole(req) === "super-admin";
};


const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


/*
|--------------------------------------------------------------------------
| Get Business ID
|--------------------------------------------------------------------------
|
| SuperAdmin:
|   Can provide business from body/query.
|
| Admin / Manager:
|   Always use authenticated user's business.
|
*/

const getBusinessId = (
  req,
  allowBody = true
) => {
  if (isSuperAdmin(req)) {
    if (allowBody && req.body?.business) {
      return req.body.business;
    }

    if (req.query?.business) {
      return req.query.business;
    }

    return null;
  }

  return (
    req.user?.business?._id ||
    req.user?.business ||
    null
  );
};


/*
|--------------------------------------------------------------------------
| Validate Business
|--------------------------------------------------------------------------
*/

const validateBusiness = async (businessId) => {
  if (
    !businessId ||
    !isValidObjectId(businessId)
  ) {
    return null;
  }

  return Business.findOne({
    _id: businessId,
    isActive: true,
  });
};


/*
|--------------------------------------------------------------------------
| Create Supplier
|--------------------------------------------------------------------------
*/

export const createSupplier = async (
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

    /*
    |--------------------------------------------------------------------------
    | Validate Business
    |--------------------------------------------------------------------------
    */

    const business =
      await validateBusiness(businessId);

    if (!business) {
      return errorResponse(
        res,
        404,
        "Business not found or inactive."
      );
    }


    const {
      name,
      companyName,
      phone,
      alternatePhone,
      email,
      address,
      city,
      country,
      taxNumber,
      openingBalance,
      creditLimit,
      paymentTerms,
      notes,
      isActive,
    } = req.body;


    /*
    |--------------------------------------------------------------------------
    | Duplicate Supplier Check
    |--------------------------------------------------------------------------
    */

    const existingSupplier =
      await Supplier.findOne({
        business: businessId,
        name: name.trim(),
      });

    if (existingSupplier) {
      return errorResponse(
        res,
        409,
        "A supplier with this name already exists in this business."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Create Supplier
    |--------------------------------------------------------------------------
    */

    const supplier =
      await Supplier.create({
        business: businessId,
        name: name.trim(),
        companyName,
        phone,
        alternatePhone,
        email,
        address,
        city,
        country,
        taxNumber,
        openingBalance,
        creditLimit,
        paymentTerms,
        notes,
        isActive,
        createdBy: req.user._id,
      });


    /*
    |--------------------------------------------------------------------------
    | Populate Response
    |--------------------------------------------------------------------------
    */

    await supplier.populate([
      {
        path: "business",
        select: "name isActive",
      },
      {
        path: "createdBy",
        select: "name email",
      },
      {
        path: "updatedBy",
        select: "name email",
      },
    ]);


    return successResponse(
      res,
      201,
      "Supplier created successfully.",
      supplier
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get All Suppliers
|--------------------------------------------------------------------------
*/

export const getAllSuppliers = async (
  req,
  res,
  next
) => {
  try {
    const businessId =
      getBusinessId(req, false);

    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }


    const {
      search = "",
      city,
      paymentTerms,
      isActive,
      page = 1,
      limit = 20,
    } = req.query;


    /*
    |--------------------------------------------------------------------------
    | Base Filter
    |--------------------------------------------------------------------------
    */

    const filter = {
      business: businessId,
    };


    /*
    |--------------------------------------------------------------------------
    | Search
    |--------------------------------------------------------------------------
    */

    if (search.trim()) {
      const searchRegex =
        new RegExp(search.trim(), "i");

      filter.$or = [
        {
          name: searchRegex,
        },
        {
          companyName: searchRegex,
        },
        {
          phone: searchRegex,
        },
        {
          email: searchRegex,
        },
        {
          taxNumber: searchRegex,
        },
      ];
    }


    /*
    |--------------------------------------------------------------------------
    | City Filter
    |--------------------------------------------------------------------------
    */

    if (city) {
      filter.city = new RegExp(
        `^${city.trim()}$`,
        "i"
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Payment Terms
    |--------------------------------------------------------------------------
    */

    if (paymentTerms) {
      filter.paymentTerms =
        paymentTerms;
    }


    /*
    |--------------------------------------------------------------------------
    | Active Filter
    |--------------------------------------------------------------------------
    */

    if (isActive !== undefined) {
      filter.isActive =
        isActive === "true";
    }


    /*
    |--------------------------------------------------------------------------
    | Pagination
    |--------------------------------------------------------------------------
    */

    const currentPage = Math.max(
      Number(page) || 1,
      1
    );

    const itemsLimit = Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

    const skip =
      (currentPage - 1) * itemsLimit;


    /*
    |--------------------------------------------------------------------------
    | Get Suppliers
    |--------------------------------------------------------------------------
    */

    const [
      suppliers,
      total,
    ] = await Promise.all([
      Supplier.find(filter)
        .populate({
          path: "business",
          select: "name isActive",
        })
        .populate({
          path: "createdBy",
          select: "name email",
        })
        .populate({
          path: "updatedBy",
          select: "name email",
        })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(itemsLimit),

      Supplier.countDocuments(filter),
    ]);


    return successResponse(
      res,
      200,
      "Suppliers fetched successfully.",
      {
        suppliers,
        pagination: {
          total,
          page: currentPage,
          limit: itemsLimit,
          totalPages: Math.ceil(
            total / itemsLimit
          ),
        },
      }
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Get Supplier By ID
|--------------------------------------------------------------------------
*/

export const getSupplierById = async (
  req,
  res,
  next
) => {
  try {
    const businessId =
      getBusinessId(req, false);

    const { id } = req.params;


    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }


    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid supplier ID."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Tenant Scoped Query
    |--------------------------------------------------------------------------
    */

    const supplier =
      await Supplier.findOne({
        _id: id,
        business: businessId,
      })
        .populate({
          path: "business",
          select: "name isActive",
        })
        .populate({
          path: "createdBy",
          select: "name email",
        })
        .populate({
          path: "updatedBy",
          select: "name email",
        });


    if (!supplier) {
      return errorResponse(
        res,
        404,
        "Supplier not found."
      );
    }


    return successResponse(
      res,
      200,
      "Supplier fetched successfully.",
      supplier
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Update Supplier
|--------------------------------------------------------------------------
*/

export const updateSupplier = async (
  req,
  res,
  next
) => {
  try {
    const businessId =
      getBusinessId(req, false);

    const { id } = req.params;


    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }


    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid supplier ID."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Find Supplier
    |--------------------------------------------------------------------------
    */

    const supplier =
      await Supplier.findOne({
        _id: id,
        business: businessId,
      });

    if (!supplier) {
      return errorResponse(
        res,
        404,
        "Supplier not found."
      );
    }


    /*
    |--------------------------------------------------------------------------
    | Prevent Business Change
    |--------------------------------------------------------------------------
    */

    if (req.body.business) {
      if (
        req.body.business.toString() !==
        businessId.toString()
      ) {
        return errorResponse(
          res,
          403,
          "You cannot move a supplier to another business."
        );
      }
    }


    /*
    |--------------------------------------------------------------------------
    | Duplicate Name Check
    |--------------------------------------------------------------------------
    */

    if (
      req.body.name &&
      req.body.name.trim() !== supplier.name
    ) {
      const existingSupplier =
        await Supplier.findOne({
          _id: { $ne: id },
          business: businessId,
          name: req.body.name.trim(),
        });

      if (existingSupplier) {
        return errorResponse(
          res,
          409,
          "A supplier with this name already exists in this business."
        );
      }
    }


    /*
    |--------------------------------------------------------------------------
    | Allowed Fields
    |--------------------------------------------------------------------------
    */

    const allowedFields = [
      "name",
      "companyName",
      "phone",
      "alternatePhone",
      "email",
      "address",
      "city",
      "country",
      "taxNumber",
      "openingBalance",
      "creditLimit",
      "paymentTerms",
      "notes",
      "isActive",
    ];


    for (const field of allowedFields) {
      if (
        req.body[field] !== undefined
      ) {
        supplier[field] =
          req.body[field];
      }
    }


    /*
    |--------------------------------------------------------------------------
    | Normalize Values
    |--------------------------------------------------------------------------
    */

    if (supplier.name) {
      supplier.name =
        supplier.name.trim();
    }

    if (supplier.email) {
      supplier.email =
        supplier.email.trim().toLowerCase();
    }


    supplier.updatedBy =
      req.user._id;


    await supplier.save();


    /*
    |--------------------------------------------------------------------------
    | Populate Response
    |--------------------------------------------------------------------------
    */

    await supplier.populate([
      {
        path: "business",
        select: "name isActive",
      },
      {
        path: "createdBy",
        select: "name email",
      },
      {
        path: "updatedBy",
        select: "name email",
      },
    ]);


    return successResponse(
      res,
      200,
      "Supplier updated successfully.",
      supplier
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Delete Supplier
|--------------------------------------------------------------------------
|
| Soft delete instead of permanently deleting.
|
*/

export const deleteSupplier = async (
  req,
  res,
  next
) => {
  try {
    const businessId =
      getBusinessId(req, false);

    const { id } = req.params;


    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }


    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid supplier ID."
      );
    }


    const supplier =
      await Supplier.findOne({
        _id: id,
        business: businessId,
      });

    if (!supplier) {
      return errorResponse(
        res,
        404,
        "Supplier not found."
      );
    }


    if (!supplier.isActive) {
      return errorResponse(
        res,
        400,
        "Supplier is already inactive."
      );
    }


    supplier.isActive = false;
    supplier.updatedBy =
      req.user._id;

    await supplier.save();


    return successResponse(
      res,
      200,
      "Supplier deleted successfully."
    );
  } catch (error) {
    next(error);
  }
};


/*
|--------------------------------------------------------------------------
| Restore Supplier
|--------------------------------------------------------------------------
*/

export const restoreSupplier = async (
  req,
  res,
  next
) => {
  try {
    const businessId =
      getBusinessId(req, false);

    const { id } = req.params;


    if (!businessId) {
      return errorResponse(
        res,
        400,
        "Business is required."
      );
    }


    if (!isValidObjectId(id)) {
      return errorResponse(
        res,
        400,
        "Invalid supplier ID."
      );
    }


    const supplier =
      await Supplier.findOne({
        _id: id,
        business: businessId,
      });

    if (!supplier) {
      return errorResponse(
        res,
        404,
        "Supplier not found."
      );
    }


    if (supplier.isActive) {
      return errorResponse(
        res,
        400,
        "Supplier is already active."
      );
    }


    supplier.isActive = true;
    supplier.updatedBy =
      req.user._id;

    await supplier.save();


    return successResponse(
      res,
      200,
      "Supplier restored successfully.",
      supplier
    );
  } catch (error) {
    next(error);
  }
};