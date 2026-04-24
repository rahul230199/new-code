const bcrypt = require("bcrypt");

(async () => {
  const hash = await bcrypt.hash("Admin@123", 10);
  console.log(hash);
})();