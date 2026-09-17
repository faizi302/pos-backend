// middlewares/validate.js

import { errorResponse } from "../utils/apiResponse.js";

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return errorResponse(
        res,
        400,
        "Validation failed.",
        errors
      );
    }

    // Use Joi's cleaned/validated values
    req.body = value;

    next();
  };
};

export default validate;