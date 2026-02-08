const express = require('express');
const router = express.Router();
router.get('/track/:id', (req, res) => res.json({tracking: req.params.id}));
module.exports = router;