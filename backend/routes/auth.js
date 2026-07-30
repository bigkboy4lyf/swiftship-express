const express = require('express');
const router = express.Router();
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const { createToken } = require('../middleware/auth');
const { issueOtp, canResend, verifyOtp, clearOtp, trustDevice, isTrustedDevice } = require('../utils/otp');
const { otpEmail } = require('../utils/emailTemplates');

function publicUser(user) {
    return { id: user._id, name: user.name, email: user.email, role: user.role };
}

// Fires the send without making the caller's HTTP response wait on it --
// real SMTP round trips (Gmail included) can take anywhere from under a
// second to 20+ seconds, which is not something a user should sit through
// on a login/register spinner. The code is already persisted by the time
// this is called, so a failed or slow send just means "click resend."
function sendEmailInBackground(to, subject, html, context) {
    sendEmail(to, subject, html).catch(err => {
        console.error(`${context} email failed to send:`, err);
    });
}

// =============================================
// REGISTER NEW USER
// =============================================
// Creates the account, then requires an emailed code before it's usable --
// see /verify-otp. A shipping address is required up front since every
// account here exists to ship something to itself or others.
router.post('/register', async (req, res) => {
    try {
        const {
            firstName, lastName, email, phone, password, accountType, newsletter,
            street, city, state, zipCode, country
        } = req.body;

        if (!street || !city || !state || !zipCode || !country) {
            return res.status(400).json({ success: false, message: 'A shipping address is required to create an account.' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            if (existingUser.emailVerified) {
                return res.status(400).json({ success: false, message: 'Email already registered' });
            }
            // They started signing up before but never entered the code --
            // pick up where they left off instead of a dead-end error.
            if (!canResend(existingUser)) {
                return res.status(429).json({ success: false, message: 'A verification code was already sent. Check your email, or wait a moment before requesting another.' });
            }
            const code = await issueOtp(existingUser);
            await existingUser.save();
            sendEmailInBackground(existingUser.email, 'Verify your SwiftShip Express account', otpEmail({
                heading: 'Confirm your email address',
                message: `Hi ${existingUser.name || ''}, use the code below to finish creating your account.`,
                code
            }), 'Registration verification');

            return res.status(200).json({
                success: true,
                message: 'Check your email for a verification code.',
                data: { email: existingUser.email, pendingVerification: true }
            });
        }

        const user = new User({
            name: `${firstName} ${lastName}`.trim(),
            email,
            phone,
            password,
            accountType: accountType || 'personal',
            newsletter: !!newsletter,
            emailVerified: false,
            addresses: [{ street, city, state, zipCode, Country: country }]
        });

        const code = await issueOtp(user);
        await user.save();

        sendEmailInBackground(user.email, 'Verify your SwiftShip Express account', otpEmail({
            heading: 'Confirm your email address',
            message: `Hi ${user.name}, welcome to SwiftShip Express! Use the code below to verify this email address.`,
            code
        }), 'Registration verification');

        res.status(201).json({
            success: true,
            message: 'Account created. Check your email for a verification code.',
            data: { email: user.email, pendingVerification: true }
        });
    } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// =============================================
// LOGIN USER
// =============================================
// A login only completes immediately when the account is verified AND the
// deviceId is already trusted. Otherwise this issues an OTP and reports
// pendingVerification instead of a token -- the client then calls
// /verify-otp with the code to actually get logged in.
router.post('/login', async (req, res) => {
    try {
        const { email, password, deviceId, deviceLabel } = req.body;

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Checked only after the password is confirmed correct, so a wrong
        // guess never reveals whether an account is deactivated.
        if (user.status && user.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: user.status === 'suspended'
                    ? 'This account has been suspended. Please contact support.'
                    : 'This account is inactive. Please contact support to reactivate it.'
            });
        }

        const needsVerification = !user.emailVerified || !isTrustedDevice(user, deviceId);
        if (needsVerification) {
            const reason = !user.emailVerified ? 'unverified_email' : 'new_device';
            const code = await issueOtp(user);
            await user.save();

            sendEmailInBackground(
                user.email,
                reason === 'new_device' ? 'Confirm this sign-in to SwiftShip Express' : 'Verify your SwiftShip Express account',
                otpEmail({
                    heading: reason === 'new_device' ? "Confirm it's you" : 'Confirm your email address',
                    message: reason === 'new_device'
                        ? "We noticed a sign-in to your account from a device we don't recognize. Enter the code below to confirm it was you."
                        : `Hi ${user.name}, use the code below to verify this email address.`,
                    code
                }),
                'Login verification'
            );

            return res.json({ success: true, data: { pendingVerification: true, reason, email: user.email } });
        }

        trustDevice(user, deviceId, deviceLabel);
        await user.save();

        const token = createToken(user);
        res.json({ success: true, data: { token, user: publicUser(user) } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// =============================================
// VERIFY OTP -- completes registration or a new-device/unverified login
// =============================================
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, code, deviceId, deviceLabel } = req.body;
        if (!email || !code) {
            return res.status(400).json({ success: false, message: 'Email and code are required' });
        }

        const user = await User.findOne({ email }).select('+otpCodeHash +otpCodeExpires');
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        }

        const result = await verifyOtp(user, code);
        if (!result.ok) {
            const message = result.reason === 'expired'
                ? 'That code has expired. Please request a new one.'
                : 'Invalid verification code.';
            return res.status(400).json({ success: false, message });
        }

        clearOtp(user);
        user.emailVerified = true;
        trustDevice(user, deviceId, deviceLabel);
        await user.save();

        const token = createToken(user);
        res.json({ success: true, data: { token, user: publicUser(user) } });
    } catch (error) {
        console.error('Verify OTP Error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

// =============================================
// RESEND OTP -- used by the registration and login verification screens
// =============================================
router.post('/resend-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        // Same "always say success" shape as forgot-password, so this can't
        // be used to check which emails have accounts.
        const genericResponse = { success: true, message: 'If that account needs a code, a new one has been sent.' };

        const user = await User.findOne({ email });
        if (!user) return res.json(genericResponse);

        if (!canResend(user)) {
            return res.status(429).json({ success: false, message: 'Please wait a moment before requesting another code.' });
        }

        const code = await issueOtp(user);
        await user.save();

        sendEmailInBackground(user.email, 'Your SwiftShip Express verification code', otpEmail({
            heading: 'Here is your new code',
            message: `Hi ${user.name || ''}, use the code below to continue.`,
            code
        }), 'Resend OTP');

        res.json(genericResponse);
    } catch (error) {
        console.error('Resend OTP Error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

// =============================================
// FORGOT PASSWORD - send a 6-digit code by email
// =============================================
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const user = await User.findOne({ email });

        // Always respond the same way whether or not the account exists,
        // so this endpoint can't be used to check who has an account here.
        const genericResponse = {
            success: true,
            message: 'If an account exists for that email, a reset code has been sent.'
        };

        if (!user) {
            return res.json(genericResponse);
        }
        if (!canResend(user)) {
            return res.json(genericResponse); // don't leak resend-cooldown state either
        }

        const code = await issueOtp(user);
        await user.save();

        sendEmailInBackground(user.email, 'Your SwiftShip Express password reset code', otpEmail({
            heading: 'Reset your password',
            message: `Hi ${user.name || ''}, use the code below to reset your password.`,
            code
        }), 'Forgot password');

        res.json(genericResponse);
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

// =============================================
// RESET PASSWORD - verify the code, set new password
// =============================================
router.post('/reset-password', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email, code, and new password are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = await User.findOne({ email }).select('+otpCodeHash +otpCodeExpires');
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        }

        const result = await verifyOtp(user, code);
        if (!result.ok) {
            const message = result.reason === 'expired'
                ? 'That code has expired. Please request a new one.'
                : 'Invalid or expired code';
            return res.status(400).json({ success: false, message });
        }

        user.password = newPassword; // pre('save') hook re-hashes this
        clearOtp(user);
        await user.save();

        res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
    }
});

module.exports = router;
