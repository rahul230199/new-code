const express = require('express');
const router = express.Router();
const { checkEmail, submitRequest } = require('../controllers/networkController');

router.post('/check-email', checkEmail);
router.post('/access/submit', submitRequest);

module.exports = router;
