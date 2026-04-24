/* =========================================================
   AXO NETWORKS — SWAGGER CONFIG (ENTERPRISE)
========================================================= */

const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "AXO Networks API",
      version: "1.0.0",
      description: "Enterprise B2B Procurement & Supply Chain API",
    },
    servers: [
      {
        url:
          process.env.NODE_ENV === "production"
            ? process.env.API_BASE_URL
            : `http://localhost:${process.env.PORT || 5000}`,
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: [
    "./src/modules/**/*.routes.js", // Auto-load route annotations
  ],
};

const swaggerSpec = swaggerJsDoc(options);

const setupSwagger = (app) => {
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    })
  );
};

module.exports = setupSwagger;
