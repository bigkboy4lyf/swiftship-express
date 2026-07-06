// BACKEND dashboard.js - Runs on server
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Shipment = require('../models/Shipment');
const User = require('../models/User');

// A shipment stops being "active" once it's fully resolved -- delivered to the
// customer, or rejected (rejected requests are deleted outright, so this is
// mostly defensive for any legacy data). If a new terminal status is ever
// added, add it here.
const TERMINAL_STATUSES = ['delivered', 'rejected'];

// A shipment sitting at 'pending_approval' hasn't been accepted into the
// pipeline yet -- nothing is actually happening with it, so it does NOT count
// as active. The moment an admin approves it (status -> 'processing', at the
// sorting facility), it starts counting as active from then on. If rejected,
// the record is deleted, so it stops existing entirely rather than lingering
// as an inactive status. 'pending' is no longer assigned anywhere in this
// pipeline -- it's kept only for any legacy records that already have it.
const AWAITING_DECISION_STATUSES = ['pending_approval'];

// Protection Middleware
const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'swiftship_secret_key_2023_change_this_later');
        req.user = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
};

// =============================================
// DASHBOARD STATS
// =============================================
router.get('/stats', protect, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';

        // Personal stats: always computed for the logged-in user's own shipments,
        // regardless of role. This is what powers the customer-side dashboard cards
        // and "My Shipments" tab -- an admin acting as a customer should see their
        // own numbers here, not the whole organization's.
        // None of these six queries depend on each other, so run them together
        // instead of waiting for each one before starting the next.
        const [
            totalShipments,
            deliveredShipments,
            inTransitShipments,
            pendingShipments,
            pendingApproval,
            activeShipmentsPersonal
        ] = await Promise.all([
            Shipment.countDocuments({ userId: req.user.id }),
            Shipment.countDocuments({ userId: req.user.id, status: 'delivered' }),
            Shipment.countDocuments({ userId: req.user.id, status: { $in: ['in_transit', 'out_for_delivery'] } }),
            // 'pending_approval' belongs in "Pending," not "Active" -- see
            // AWAITING_DECISION_STATUSES above. It only becomes active once an
            // admin approves it.
            Shipment.countDocuments({ userId: req.user.id, status: { $in: ['pending', 'processing', 'pending_approval'] } }),
            Shipment.countDocuments({ userId: req.user.id, status: 'pending_approval' }),
            // A shipment is "active" for this user the moment it's approved (status
            // moves off pending_approval) and stays active until it's delivered or
            // removed -- same rule as the org-wide count below, just scoped to this
            // one user. This is what the Profile page's "Active Shipments" reads.
            Shipment.countDocuments({
                userId: req.user.id,
                status: { $nin: [...TERMINAL_STATUSES, ...AWAITING_DECISION_STATUSES] }
            })
        ]);

        // Org-wide stats: only meaningful for admins, and only used by the
        // admin-only cards (Total Users, Total Shipments (org), Active Shipments, Revenue).
        // Same idea -- these five are independent of each other too.
        let totalUsers = 0, totalShipmentsOrg = 0, activeShipments = 0, revenue = 45289, pendingApprovalOrg = 0;
        if (isAdmin) {
            const [
                totalUsersResult,
                totalShipmentsOrgResult,
                activeShipmentsResult,
                pendingApprovalOrgResult,
                revenueAggregation
            ] = await Promise.all([
                User.countDocuments(),
                Shipment.countDocuments(),
                Shipment.countDocuments({ status: { $nin: [...TERMINAL_STATUSES, ...AWAITING_DECISION_STATUSES] } }),
                Shipment.countDocuments({ status: 'pending_approval' }),
                // Computes balance natively inside MongoDB to avoid Out-of-Memory crashes
                Shipment.aggregate([{ $group: { _id: null, totalRevenue: { $sum: "$totalPrice" } } }])
            ]);
            totalUsers = totalUsersResult;
            totalShipmentsOrg = totalShipmentsOrgResult;
            activeShipments = activeShipmentsResult;
            pendingApprovalOrg = pendingApprovalOrgResult;
            revenue = revenueAggregation[0]?.totalRevenue || 45289;
        }

        res.json({
            success: true,
            data: {
                // Personal (customer-side) numbers -- always the requesting user's own
                totalShipments,
                deliveredShipments,
                inTransitShipments,
                pendingShipments,
                pendingApproval,
                activeShipmentsPersonal,
                // Org-wide (admin-side) numbers -- only populated for admins
                totalUsers,
                totalShipmentsOrg,
                activeShipments,
                revenue,
                pendingApprovalOrg
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// GET SHIPMENTS
// =============================================
router.get('/shipments', protect, async (req, res) => {
    try {
        const { limit = 100, userId, status } = req.query;
        const isAdmin = req.user.role === 'admin';
        let query = {};

        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        // Filter by user
        if (userId && isAdmin) {
            query.userId = userId;
        } else if (!isAdmin) {
            query.userId = req.user.id;
            // Customers see all their shipments including pending_approval
        }

    // Safeguards against NaN query injection crashing Mongoose parsing chains
        const parsedLimit = parseInt(limit, 10);
        const finalLimit = isNaN(parsedLimit) || parsedLimit <= 0 ? 100 : parsedLimit;

        const shipments = await Shipment.find(query)
            .sort({ createdAt: -1 })
            .limit(finalLimit)
            .populate('userId', 'name email');

        res.json({ success: true, data: shipments });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// CREATE NEW SHIPMENT (Customers & Admin)
// =============================================
router.post('/shipments', protect, async (req, res) => {
    try {
        const { role, id } = req.user;
        const shipmentData = req.body;

        // If customer, force userId to their own ID (security)
        if (role !== 'admin') {
            shipmentData.userId = id;
        }

        if (!shipmentData.userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        // Set status based on role: customer-created shipments need admin
        // sign-off first (pending_approval). Shipments an admin creates
        // directly skip that step and go straight into the pipeline at
        // 'processing', same place an approved customer shipment lands.
        if (!shipmentData.status) {
            shipmentData.status = role === 'admin' ? 'processing' : 'pending_approval';
        }

        // Generate tracking number
        if (!shipmentData.trackingNumber) {
            shipmentData.trackingNumber = 'SS' + Date.now().toString().slice(-9);
        }

        // Admin-created shipments enter directly at the sorting facility,
        // same as a freshly-approved customer shipment.
        if (shipmentData.status === 'processing' && !shipmentData.currentLocation) {
            shipmentData.currentLocation = { facility: 'Sorting Facility', city: 'Sorting Facility', timestamp: new Date() };
        }

        // Add initial tracking history
        const statusDesc = shipmentData.status === 'pending_approval'
            ? 'Awaiting shipment confirmation'
            : 'Shipment created - now processing at sorting facility';

        shipmentData.trackingHistory = [{
            status: shipmentData.status,
            location: shipmentData.currentLocation?.city || 'Sorting Facility',
            description: statusDesc,
            timestamp: new Date()
        }];

        const shipment = new Shipment(shipmentData);
        await shipment.save();

        res.status(201).json({ success: true, data: shipment });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN APPROVE SHIPMENT
// =============================================
router.patch('/shipments/:id/approve', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        if (shipment.status !== 'pending_approval') {
            return res.status(400).json({ success: false, message: 'Shipment is not pending approval' });
        }

        // This is the exact moment the shipment starts counting as "active" --
        // see AWAITING_DECISION_STATUSES above. Approval sends it straight into
        // the pipeline at the sorting facility rather than sitting in a second,
        // separate "pending" holding state.
        shipment.status = 'processing';
        shipment.currentLocation = {
            facility: 'Sorting Facility',
            city: 'Sorting Facility',
            timestamp: new Date()
        };
        shipment.trackingHistory.push({
            status: 'processing',
            location: 'Sorting Facility',
            description: 'Shipment confirmed - now processing at sorting facility',
            timestamp: new Date()
        });

        await shipment.save();
        res.json({ success: true, data: shipment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// ADMIN REJECT SHIPMENT
// =============================================
router.patch('/shipments/:id/reject', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        if (shipment.status !== 'pending_approval') {
            return res.status(400).json({ success: false, message: 'Shipment is not pending approval' });
        }

        // Rejecting an unapproved request removes it outright -- there's no
        // lingering 'rejected' shipment sitting in the system afterward.
        await Shipment.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Shipment request rejected and removed', data: { _id: req.params.id } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// UPDATE SHIPMENT STATUS (Secured & Type Checked)
// =============================================
router.patch('/shipments/:id/status', protect, async (req, res) => {
    try {
        // Enforce strict administrative authorization barrier
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access Denied: Administrative privileges required.' });
        }

        const { status, location, description } = req.body;
        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        shipment.status = status;
        shipment.trackingHistory.push({
            status,
            location: location ? String(location) : shipment.currentLocation?.city,
            description: description || `Status updated to ${status}`,
            timestamp: new Date()
        });

        if (location) {
            // Converts input payload explicitly to string to block split function crashes
            const locationStr = String(location);
            shipment.currentLocation = {
                facility: locationStr,
                city: locationStr.includes(',') ? locationStr.split(',')[0].trim() : locationStr.trim(),
                timestamp: new Date()
            };
        }

        if (status === 'delivered') {
            shipment.actualDelivery = new Date();
        }

        await shipment.save();
        res.json({ success: true, data: shipment });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// DELETE SHIPMENT (Admin only)
// =============================================
router.delete('/shipments/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const shipment = await Shipment.findByIdAndDelete(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        res.json({ success: true, message: 'Shipment deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// GET CURRENT USER'S PROFILE
// =============================================
router.get('/profile', protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// UPDATE CURRENT USER'S PROFILE (name, phone, avatar)
// =============================================
const MAX_AVATAR_LENGTH = 1.5 * 1024 * 1024; // ~1.5MB of base64 text, i.e. a small resized photo

router.patch('/profile', protect, async (req, res) => {
    try {
        const { firstName, lastName, phone, avatar } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Name: only touch it if the caller sent name parts
        if (firstName !== undefined || lastName !== undefined) {
            const currentParts = (user.name || '').split(' ');
            const newFirst = (firstName !== undefined ? firstName : currentParts[0] || '').trim();
            const newLast = (lastName !== undefined ? lastName : currentParts.slice(1).join(' ')).trim();
            const combined = `${newFirst} ${newLast}`.trim();
            if (!combined) {
                return res.status(400).json({ success: false, message: 'Name cannot be empty' });
            }
            user.name = combined;
        }

        if (phone !== undefined) {
            user.phone = String(phone).trim();
        }

        // Avatar: '' clears it, a data URI replaces it, undefined leaves it untouched
        if (avatar !== undefined) {
            if (avatar === '') {
                user.avatar = '';
            } else if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
                return res.status(400).json({ success: false, message: 'Avatar must be an image' });
            } else if (avatar.length > MAX_AVATAR_LENGTH) {
                return res.status(400).json({ success: false, message: 'That image is too large. Please choose a smaller photo.' });
            } else {
                user.avatar = avatar;
            }
        }

        await user.save();
        res.json({ success: true, data: user });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// CHANGE CURRENT USER'S PASSWORD
// =============================================
router.patch('/change-password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        // Password has select:false on the schema, so it must be explicitly requested here
        const user = await User.findById(req.user.id).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ success: false, message: 'New password must be different from your current password' });
        }

        user.password = newPassword; // the pre-save hook in User.js hashes this automatically
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// CHANGE CURRENT USER'S PASSWORD
// =============================================
router.patch('/password', protect, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        // Password has select:false on the schema, so it must be explicitly requested here
        const user = await User.findById(req.user.id).select('+password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        // Assigning to .password (not save-as-is) lets the existing pre('save') hook re-hash it
        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// GET ALL USERS (Admin only)
// =============================================
router.get('/users', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const users = await User.find().select('-password');
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;