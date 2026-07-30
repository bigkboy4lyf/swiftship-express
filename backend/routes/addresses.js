const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// =============================================
// GET ADDRESSES
// =============================================
// .select('addresses') pulls only that field instead of the whole user
// document -- otherwise every address check drags the (potentially large,
// base64-encoded) avatar photo along with it for no reason. .lean() skips
// building a full Mongoose document since we're only reading, not saving.
router.get('/', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('addresses').lean();
        res.json(user?.addresses || []);
    } catch (err) {
        res.status(500).json({ message: 'Error fetching addresses' });
    }
});

// =============================================
// ADD A NEW ADDRESS
// =============================================
router.post('/', protect, async (req, res) => {
    try {
        // Same idea as GET: only load the addresses field. Mongoose skips
        // required-field validation on paths that weren't selected, so
        // save() below still works fine even though name/email/password/
        // avatar were never loaded into this document.
        const user = await User.findById(req.user.id).select('addresses');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (user.addresses.length >= 3) {
            return res.status(400).json({ message: 'Address limit of 3 reached.' });
        }

        const { street, city, state, zipCode, country } = req.body;

        user.addresses.push({
            street,
            city,
            state,
            zipCode,
            Country: country
        });

        await user.save();
        res.status(201).json(user.addresses);
    } catch (err) {
        console.error('Database Save Error:', err);
        res.status(500).json({ message: 'Database validation failed. Ensure all fields are filled.' });
    }
});

// =============================================
// DELETE AN ADDRESS
// =============================================
// $pull removes the address directly inside MongoDB in a single round trip --
// the full user document (avatar included) never has to travel to Node and
// back just to drop one array item.
router.delete('/:addressId', protect, async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $pull: { addresses: { _id: req.params.addressId } } },
            { new: true, select: 'addresses' }
        ).lean();
        res.json(updatedUser?.addresses || []);
    } catch (err) {
        res.status(500).json({ message: 'Error deleting address' });
    }
});

module.exports = router;
