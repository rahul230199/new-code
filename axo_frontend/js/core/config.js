/* =========================================================
   AXO NETWORKS — FRONTEND CONFIG
========================================================= */

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const CONFIG = {

  API_BASE_URL: isLocal
    ? "http://localhost:3000/api"
    : "/api",

  TOKEN_KEY: "axo_access_token",
  USER_KEY: "axo_user",

  APP_NAME: "AXO Networks",
  VERSION: "1.0.0",

  REQUEST_TIMEOUT: 15000
};

export default CONFIG;
