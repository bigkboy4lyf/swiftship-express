const bcrypt = require('bcryptjs');

const OTP_TTL_MS = 15 * 60 * 1000; // codes expire after 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // one resend per minute per account

function generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generates a fresh code, hashes it onto the user document, and returns the
// plain code so the caller can email it. Caller is responsible for save()ing
// the user afterward.
async function issueOtp(user) {
    const code = generateCode();
    const salt = await bcrypt.genSalt(10);
    user.otpCodeHash = await bcrypt.hash(code, salt);
    user.otpCodeExpires = new Date(Date.now() + OTP_TTL_MS);
    user.otpLastSentAt = new Date();
    return code;
}

function canResend(user) {
    if (!user.otpLastSentAt) return true;
    return Date.now() - user.otpLastSentAt.getTime() > RESEND_COOLDOWN_MS;
}

// Requires the user document to have been fetched with
// .select('+otpCodeHash +otpCodeExpires').
async function verifyOtp(user, code) {
    if (!user.otpCodeHash || !user.otpCodeExpires) return { ok: false, reason: 'no_code' };
    if (user.otpCodeExpires < new Date()) return { ok: false, reason: 'expired' };
    const matches = await bcrypt.compare(String(code || ''), user.otpCodeHash);
    if (!matches) return { ok: false, reason: 'mismatch' };
    return { ok: true };
}

function clearOtp(user) {
    user.otpCodeHash = null;
    user.otpCodeExpires = null;
}

// Marks a device as trusted (updating its last-seen time if already known).
// Keeps the list capped so it can't grow without bound on an account that
// gets verified from lots of different browsers over time.
const MAX_TRUSTED_DEVICES = 10;

function trustDevice(user, deviceId, userAgent) {
    if (!deviceId) return;
    const existing = user.trustedDevices.find(d => d.deviceId === deviceId);
    if (existing) {
        existing.lastSeenAt = new Date();
        return;
    }
    user.trustedDevices.push({ deviceId, userAgent: userAgent || 'Unknown device' });
    if (user.trustedDevices.length > MAX_TRUSTED_DEVICES) {
        user.trustedDevices.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
        user.trustedDevices = user.trustedDevices.slice(0, MAX_TRUSTED_DEVICES);
    }
}

function isTrustedDevice(user, deviceId) {
    return !!deviceId && user.trustedDevices.some(d => d.deviceId === deviceId);
}

module.exports = {
    issueOtp,
    canResend,
    verifyOtp,
    clearOtp,
    trustDevice,
    isTrustedDevice,
    RESEND_COOLDOWN_MS
};
