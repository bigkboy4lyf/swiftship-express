const express = require('express');
const router = express.Router();
router.post('/login', (req, res) => res.json({message: 'Login'}));
module.exports = router;