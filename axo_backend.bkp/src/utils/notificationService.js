const pool = require("../config/db");

exports.createNotification = async (
  client,
  {
    organizationId,
    userId = null,
    role = null,
    title,
    message,
    type,
    referenceType = null,
    referenceId = null
  }
) => {

  const executor = client || pool;

  await executor.query(
    `
    INSERT INTO notifications
    (organization_id, user_id, role,
     title, message, type,
     reference_type, reference_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      organizationId,
      userId,
      role,
      title,
      message,
      type,
      referenceType,
      referenceId
    ]
  );
};