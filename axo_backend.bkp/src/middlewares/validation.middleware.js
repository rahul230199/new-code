/* =========================================================
   AXO NETWORKS — VALIDATION MIDDLEWARE (ENTERPRISE READY)
   - Required field validation
   - Supports body, params, query
   - Structured AppError integration
========================================================= */

const AppError = require("../utils/AppError");

/* =========================================================
   REQUIRED FIELD VALIDATOR
========================================================= */

const validateRequiredFields = (
  requiredFields = [],
  location = "body" // body | params | query
) => {
  return (req, res, next) => {
    const source = req[location];

    if (!source) {
      return next(
        new AppError(`Invalid request ${location} data.`, 400, {
          errorCode: "VALIDATION_SOURCE_INVALID",
        })
      );
    }

    const missingFields = [];

    requiredFields.forEach((field) => {
      const value = source[field];

      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        missingFields.push(field);
      }
    });

    if (missingFields.length > 0) {
      return next(
        new AppError(
          `Missing required fields: ${missingFields.join(", ")}`,
          400,
          {
            errorCode: "VALIDATION_REQUIRED_FIELDS",
            meta: { missingFields },
          }
        )
      );
    }

    next();
  };
};

module.exports = {
  validateRequiredFields,
};
