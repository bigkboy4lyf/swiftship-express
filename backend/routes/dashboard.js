const express = require('express');
const router = express.Router();
const Shipment = require('../models/Shipment');
const User = require('../models/User');
const PaymentAccount = require('../models/PaymentAccount');
const FeeSettings = require('../models/FeeSettings');
const { FEE_TYPES, setShipmentFeeActive, getFeesAccrued, getTotalOwed, getBalanceDue, isFullyPaid } = require('../utils/feeAccrual');
const { protect } = require('../middleware/auth');
const { documentVerificationCode } = require('../utils/verification');
const sendEmail = require('../utils/sendEmail');
const { quoteEmail, receiptSubmittedEmail, otpEmail } = require('../utils/emailTemplates');
const { issueOtp, canResend, verifyOtp, clearOtp } = require('../utils/otp');
const { notifyUser, statusLabel } = require('../utils/notifications');

const SUPPORT_EMAIL = 'helpdesk.swiftship@gmail.com';

// Every shipment-related notification links here -- dashboard.html's "My
// Shipments" tab shows every shipment for both customers and admins acting
// on their own account, so it's the right landing spot regardless of role.
const SHIPMENTS_TAB_LINK = 'dashboard.html?tab=user-shipments';

// Shared by /approve and /receipt/confirm -- both move a shipment from
// pending_approval into the pipeline at the sorting facility the same way.
function advanceToProcessing(shipment, historyDescription) {
    shipment.status = 'processing';
    shipment.currentLocation = {
        facility: 'Sorting Facility',
        city: 'Sorting Facility',
        timestamp: new Date()
    };
    shipment.trackingHistory.push({
        status: 'processing',
        location: 'Sorting Facility',
        description: historyDescription,
        timestamp: new Date()
    });

    // Fire-and-forget: notifyUser never throws, and the notification's
    // content only needs the in-memory fields already set above, not the
    // save() that happens afterward in the caller.
    notifyUser(shipment.userId, {
        type: 'shipment_status',
        title: 'Shipment Update',
        message: `${shipment.trackingNumber}: ${historyDescription}`,
        link: SHIPMENTS_TAB_LINK
    });
}

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

// =============================================
// DASHBOARD STATS
// =============================================
router.get('/stats', protect, async (req, res) => {
    try {
        // The Profile tab only ever reads activeShipmentsPersonal (see
        // loadProfileData() in dashboard-ui.js) -- ?scope=personal lets it
        // skip the whole org-wide block below, including a full-collection
        // revenue aggregation that's pure waste when nobody's going to look
        // at it.
        const isAdmin = req.user.role === 'admin' && req.query.scope !== 'personal';

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
        const { limit = 100, userId, status, paymentStatus } = req.query;
        const isAdmin = req.user.role === 'admin';
        let query = {};

        // Filter by status if provided
        if (status) {
            query.status = status;
        }

        // Powers the admin Payment Reviews tab (e.g. ?paymentStatus=pending)
        if (paymentStatus) {
            query['paymentReceipt.status'] = paymentStatus;
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

        const shipmentsQuery = Shipment.find(query)
            .sort({ createdAt: -1 })
            .limit(finalLimit)
            .populate('userId', 'name email')
            // Read-only response -- skips Mongoose document hydration since
            // nothing here needs instance methods, only plain data.
            .lean();

        // paymentReceipt.data is a base64 image/PDF up to ~7MB *per shipment*.
        // The only screen that renders it is the Payment Reviews tab (which
        // always calls this with ?paymentStatus=...) -- My Shipments, All
        // Shipments, and Recent Shipments never touch it, so they shouldn't
        // pay to download it either.
        if (!paymentStatus) {
            shipmentsQuery.select('-paymentReceipt.data');
        }

        const shipments = await shipmentsQuery;

        // Attached here rather than stored, so none of it can go stale
        // relative to the fields it's derived from -- verificationCode
        // (utils/verification.js) is pinned to the original charge, while
        // feesAccrued/totalOwed/balanceDue (utils/feeAccrual.js) reflect
        // whatever's accrued as of right now. Every screen that shows an
        // invoice, a receipt, or a balance (dashboard, admin panel, payment
        // review queue) reads these instead of re-deriving them, so they can
        // never disagree with each other or with the accrual job.
        const withBilling = shipments.map(s => ({
            ...s,
            verificationCode: documentVerificationCode(s),
            feesAccrued: getFeesAccrued(s),
            totalOwed: getTotalOwed(s),
            balanceDue: getBalanceDue(s)
        }));

        res.json({ success: true, data: withBilling });
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

        notifyUser(shipment.userId, {
            type: 'shipment_created',
            title: 'Shipment Created',
            message: `Shipment ${shipment.trackingNumber} to ${shipment.recipient?.city || 'your destination'}, ${shipment.recipient?.country || ''} has been created and is ${statusLabel(shipment.status)}.`,
            link: SHIPMENTS_TAB_LINK
        });

        if (shipment.sender?.email) {
            sendEmail.inBackground(
                shipment.sender.email,
                `Your SwiftShip Express Quote -- ${shipment.trackingNumber}`,
                quoteEmail({
                    customerName: shipment.sender.name,
                    trackingNumber: shipment.trackingNumber,
                    originCity: shipment.sender.city,
                    originCountry: shipment.sender.country,
                    destCity: shipment.recipient?.city,
                    destCountry: shipment.recipient?.country,
                    serviceType: shipment.serviceType,
                    weight: shipment.package?.weight,
                    pricing: shipment.pricing,
                    totalPrice: shipment.totalPrice,
                    dashboardUrl: `${req.protocol}://${req.get('host')}/dashboard`,
                    supportEmail: SUPPORT_EMAIL
                }),
                'Quote'
            );
        }

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
        advanceToProcessing(shipment, 'Shipment confirmed - now processing at sorting facility');

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

        // Notified before the delete below -- the record (and its userId)
        // won't exist to reference afterward.
        notifyUser(shipment.userId, {
            type: 'shipment_rejected',
            title: 'Shipment Request Declined',
            message: `Your shipment request ${shipment.trackingNumber} was declined. Please contact support if you have questions.`,
            link: SHIPMENTS_TAB_LINK
        });

        // Rejecting an unapproved request removes it outright -- there's no
        // lingering 'rejected' shipment sitting in the system afterward.
        await Shipment.findByIdAndDelete(req.params.id);

        res.json({ success: true, message: 'Shipment request rejected and removed', data: { _id: req.params.id } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// PAYMENT RECEIPT (submit / admin confirm / admin reject)
// =============================================
// Both the card and bank transfer flows converge on the same upload step
// (frontend/submit-receipt.html) -- whichever method got them there is
// recorded just for admin's context in the Payment Reviews tab.
const MAX_RECEIPT_LENGTH = 7 * 1024 * 1024; // ~7MB of base64 text, i.e. up to ~5MB file

router.patch('/shipments/:id/receipt', protect, async (req, res) => {
    try {
        const { data, filename, contentType, method } = req.body;

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        if (req.user.role !== 'admin' && String(shipment.userId) !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        if (typeof data !== 'string' || !(data.startsWith('data:image/') || data.startsWith('data:application/pdf'))) {
            return res.status(400).json({ success: false, message: 'Receipt must be an image or PDF file' });
        }
        if (data.length > MAX_RECEIPT_LENGTH) {
            return res.status(400).json({ success: false, message: 'That file is too large. Please choose a file smaller than 5MB.' });
        }

        shipment.paymentReceipt = {
            data,
            filename: filename || 'receipt',
            contentType: contentType || '',
            method: method === 'bank_transfer' ? 'bank_transfer' : 'card',
            status: 'pending',
            submittedAt: new Date()
        };
        await shipment.save();

        // No notifications engine yet -- an email to support is the interim
        // signal that a receipt is waiting in the Payment Reviews tab.
        sendEmail.inBackground(
            SUPPORT_EMAIL,
            `Payment receipt submitted -- ${shipment.trackingNumber}`,
            receiptSubmittedEmail({
                trackingNumber: shipment.trackingNumber,
                customerName: shipment.sender?.name,
                customerEmail: shipment.sender?.email
            }),
            'Receipt submission notice'
        );

        res.json({ success: true, data: shipment });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// Amounts are rounded to the cent before every comparison/store so repeated
// partial payments can't drift away from a clean $0.00 balance due to
// floating point error.
const round2 = (n) => Math.round(n * 100) / 100;

router.patch('/shipments/:id/receipt/confirm', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        if (shipment.paymentReceipt?.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'No pending receipt to confirm' });
        }

        // Balance due includes any demurrage/storage accrued since the
        // original invoice -- see utils/feeAccrual.js. A shipment can't be
        // confirmed as settled while a fee balance remains outstanding, even
        // if the original shipping charge itself was paid off long ago.
        const balanceDue = getBalanceDue(shipment);

        const amount = round2(Number(req.body.amount));
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Enter a valid payment amount greater than zero.' });
        }
        // The one thing this endpoint must never allow -- confirming more
        // than is actually still owed and overcharging the customer.
        if (amount > balanceDue) {
            return res.status(400).json({ success: false, message: `That's more than the remaining balance of $${balanceDue.toFixed(2)}.` });
        }

        shipment.amountPaid = round2((shipment.amountPaid || 0) + amount);
        shipment.paymentReceipt.status = 'confirmed';
        shipment.paymentReceipt.amount = amount;
        shipment.paymentReceipt.resolvedAt = new Date();

        const fullyPaid = isFullyPaid(shipment);

        // Confirming payment is what actually unblocks the shipment -- same
        // pipeline entry point as a manual /approve. Only once the invoice
        // is fully paid off, though -- a partial payment keeps it an unpaid
        // invoice so the customer can submit another receipt for the rest.
        if (fullyPaid && shipment.status === 'pending_approval') {
            advanceToProcessing(shipment, 'Payment confirmed - now processing at sorting facility');
        } else if (!fullyPaid) {
            shipment.trackingHistory.push({
                status: shipment.status,
                description: `Partial payment of $${amount.toFixed(2)} confirmed -- $${getBalanceDue(shipment).toFixed(2)} balance remaining`,
                timestamp: new Date()
            });
        } else if (shipment.status !== 'pending_approval') {
            // Fully paid, but this shipment already moved past pending_approval
            // before this payment -- so this settled a fee balance that
            // accrued after the original invoice, not the initial shipment
            // charge. There's no status transition to make, just a record
            // that the account is now current.
            shipment.trackingHistory.push({
                status: shipment.status,
                description: `Payment of $${amount.toFixed(2)} confirmed -- outstanding balance fully settled`,
                timestamp: new Date()
            });
        }

        await shipment.save();
        res.json({ success: true, data: shipment });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.patch('/shipments/:id/receipt/reject', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { reason } = req.body;
        if (!reason || !reason.trim()) {
            return res.status(400).json({ success: false, message: 'A reason is required to reject a payment receipt' });
        }

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }
        if (shipment.paymentReceipt?.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'No pending receipt to reject' });
        }

        // Shipment itself is left untouched (still pending_approval) so the
        // customer's invoice button reverts from "Payment Processing" back
        // to "View Invoice" and they can retry.
        shipment.paymentReceipt.status = 'rejected';
        shipment.paymentReceipt.rejectionReason = reason.trim();
        shipment.paymentReceipt.resolvedAt = new Date();

        notifyUser(shipment.userId, {
            type: 'shipment_status',
            title: 'Payment Receipt Rejected',
            message: `Your payment receipt for shipment ${shipment.trackingNumber} was rejected: ${reason.trim()}. Please submit a new receipt.`,
            link: SHIPMENTS_TAB_LINK
        });

        await shipment.save();
        res.json({ success: true, data: shipment });
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

        notifyUser(shipment.userId, {
            type: 'shipment_status',
            title: 'Shipment Update',
            message: `${shipment.trackingNumber} is now ${statusLabel(status)}${location ? ` (${String(location)})` : ''}.`,
            link: SHIPMENTS_TAB_LINK
        });

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

        if (currentPassword === newPassword) {
            return res.status(400).json({ success: false, message: 'New password must be different from your current password' });
        }

        // Assigning to .password (not save-as-is) lets the existing pre('save') hook re-hash it
        user.password = newPassword;
        await user.save();

        notifyUser(user._id, {
            type: 'password_changed',
            title: 'Password Changed',
            message: "Your account password was just changed. If you didn't do this, contact support immediately.",
            link: 'dashboard.html?tab=user-profile'
        });

        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

const EMAIL_PATTERN = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;

// =============================================
// REQUEST AN EMAIL CHANGE -- sends a code to the NEW address to confirm
// the user actually owns it before it replaces the one on file. Also used
// to resend: calling it again with the same newEmail just issues a fresh code.
// =============================================
router.post('/profile/email/request', protect, async (req, res) => {
    try {
        const newEmail = String(req.body.newEmail || '').trim().toLowerCase();
        if (!newEmail || !EMAIL_PATTERN.test(newEmail)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
        }

        const user = await User.findById(req.user.id).select('+otpLastSentAt');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        if (newEmail === user.email) {
            return res.status(400).json({ success: false, message: 'That is already your email address' });
        }

        const existing = await User.findOne({ email: newEmail });
        if (existing) {
            return res.status(400).json({ success: false, message: 'That email address is already in use' });
        }
        if (!canResend(user)) {
            return res.status(429).json({ success: false, message: 'Please wait a moment before requesting another code.' });
        }

        user.pendingEmail = newEmail;
        const code = await issueOtp(user);
        await user.save();

        sendEmail.inBackground(newEmail, 'Confirm your new SwiftShip Express email', otpEmail({
            heading: 'Confirm your new email address',
            message: `Hi ${user.name || ''}, use the code below to confirm this address as your new SwiftShip Express login email.`,
            code
        }), 'Email change verification');

        res.json({ success: true, message: `A verification code has been sent to ${newEmail}.` });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// VERIFY THE CODE AND APPLY THE PENDING EMAIL CHANGE
// =============================================
router.post('/profile/email/verify', protect, async (req, res) => {
    try {
        const code = req.body.code;
        if (!code) {
            return res.status(400).json({ success: false, message: 'Verification code is required' });
        }

        const user = await User.findById(req.user.id).select('+otpCodeHash +otpCodeExpires +pendingEmail');
        if (!user || !user.pendingEmail) {
            return res.status(400).json({ success: false, message: 'No pending email change to confirm' });
        }

        const result = await verifyOtp(user, code);
        if (!result.ok) {
            const message = result.reason === 'expired'
                ? 'That code has expired. Please request a new one.'
                : 'Invalid verification code.';
            return res.status(400).json({ success: false, message });
        }

        // Guards against another account claiming the address during the
        // window the code was outstanding.
        const existing = await User.findOne({ email: user.pendingEmail });
        if (existing) {
            user.pendingEmail = null;
            clearOtp(user);
            await user.save();
            return res.status(400).json({ success: false, message: 'That email address was just claimed by another account. Please start over with a different address.' });
        }

        user.email = user.pendingEmail;
        user.pendingEmail = null;
        clearOtp(user);
        await user.save();

        res.json({ success: true, message: 'Email address updated successfully', data: { email: user.email } });
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
        // avatar is a base64 photo up to ~1.5MB per user -- this list only
        // ever renders name/email/role/status (see renderUsers() in
        // admin-ui.js), so there's no reason to ship every user's photo
        // just to populate a table of text. .lean() also skips document
        // hydration since this is a read-only response.
        const users = await User.find().select('-password -avatar').lean();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// CREATE USER (Admin only)
// =============================================
router.post('/users', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { name, email, password, phone, role, accountType, status } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
        }

        const user = new User({ name, email, password, phone, role, accountType, status });
        await user.save(); // pre('save') hook hashes the password

        const created = user.toObject();
        delete created.password;

        res.status(201).json({ success: true, data: created });
    } catch (error) {
        // Mongoose duplicate-key error on the unique email index
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'A user with that email already exists' });
        }
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// UPDATE USER (Admin only)
// =============================================
router.put('/users/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { name, email, phone, role, accountType, status, password } = req.body;
        const isSelf = req.user.id === req.params.id;

        // An admin editing their own account can't demote themselves or lock
        // themselves out -- otherwise a single click could strand every admin
        // with no way back in.
        if (isSelf && role && role !== 'admin') {
            return res.status(400).json({ success: false, message: "You can't remove your own admin role" });
        }
        if (isSelf && status && status !== 'active') {
            return res.status(400).json({ success: false, message: "You can't deactivate your own account" });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (name !== undefined) user.name = name;
        if (email !== undefined) user.email = email;
        if (phone !== undefined) user.phone = phone;
        if (role !== undefined) user.role = role;
        if (accountType !== undefined) user.accountType = accountType;
        if (status !== undefined) user.status = status;
        if (password) user.password = password; // pre('save') hook re-hashes it

        await user.save();

        const updated = user.toObject();
        delete updated.password;

        res.json({ success: true, data: updated });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'A user with that email already exists' });
        }
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// DELETE USER (Admin only)
// =============================================
router.delete('/users/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        if (req.user.id === req.params.id) {
            return res.status(400).json({ success: false, message: "You can't delete your own account" });
        }

        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// PAYMENT ACCOUNTS (bank transfer details)
// =============================================
// Bank transfer is always offered alongside card checkout on every invoice --
// it's not restricted to any particular destination, just recommended for
// limited-service ones. Keyed by country code, plus a reserved 'PARENT' entry
// (the "parent account") used for any destination without its own specific
// account -- set once, it covers every country by default. Any logged-in
// user can read these (the paying customer needs to see them for their own
// shipment's destination); only admins can create/edit/remove them. No fixed
// country-code list is enforced server-side on purpose -- which countries
// count as "limited service" lives in the frontend
// (frontend/js/countries-data.js) and can change without a backend deploy.
router.get('/payment-accounts', protect, async (req, res) => {
    try {
        const accounts = await PaymentAccount.find();
        res.json({ success: true, data: accounts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/payment-accounts/:countryCode', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const countryCode = req.params.countryCode.toUpperCase();
        const {
            bankName, accountName, accountNumber, iban, swiftBic, routingNumber,
            sortCode, branchName, branchAddress, currency, intermediaryBank, additionalInstructions
        } = req.body;

        const account = await PaymentAccount.findOneAndUpdate(
            { countryCode },
            {
                countryCode, bankName, accountName, accountNumber, iban, swiftBic, routingNumber,
                sortCode, branchName, branchAddress, currency, intermediaryBank, additionalInstructions
            },
            { new: true, upsert: true, runValidators: true }
        );

        res.json({ success: true, data: account });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

router.delete('/payment-accounts/:countryCode', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        await PaymentAccount.findOneAndDelete({ countryCode: req.params.countryCode.toUpperCase() });
        res.json({ success: true, message: 'Payment account cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// FEE SETTINGS (demurrage / storage) -- read or set the uniform per-day
// rate for one fee type. This is the only thing kept platform-wide; which
// shipments actually get charged that rate is targeted per-shipment below.
// The daily accrual job (utils/feeAccrual.js) reads this same document every
// run, so a rate change here takes effect on the next 24h pass with no
// restart needed.
// =============================================
router.get('/fee-settings', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const settings = await FeeSettings.getSingleton();
        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

router.patch('/fee-settings/:type', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { type } = req.params;
        if (!FEE_TYPES.includes(type)) {
            return res.status(400).json({ success: false, message: 'Unknown fee type' });
        }

        const rate = Number(req.body.ratePerDay);
        if (!Number.isFinite(rate) || rate < 0) {
            return res.status(400).json({ success: false, message: 'Rate must be a non-negative number' });
        }

        const settings = await FeeSettings.getSingleton();
        settings[type].ratePerDay = round2(rate);
        settings.updatedAt = new Date();
        settings.updatedBy = req.user.id;
        await settings.save();

        res.json({ success: true, data: settings });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// =============================================
// PER-SHIPMENT FEE TARGETING -- flags an individual shipment as subject to
// demurrage and/or storage. This is the actual "which accounts get charged"
// control: the rate above is uniform, but nothing accrues on any shipment
// until admin opts it in here. setShipmentFeeActive also fires the
// "fee activated" notification the moment it's switched on.
// =============================================
router.patch('/shipments/:id/fees/:type', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }

        const { type } = req.params;
        if (!FEE_TYPES.includes(type)) {
            return res.status(400).json({ success: false, message: 'Unknown fee type' });
        }

        const shipment = await Shipment.findById(req.params.id);
        if (!shipment) {
            return res.status(404).json({ success: false, message: 'Shipment not found' });
        }

        await setShipmentFeeActive(shipment, type, !!req.body.active);
        await shipment.save();

        res.json({ success: true, data: shipment });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

module.exports = router;