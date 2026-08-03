const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false // 🔥 SECURITY: This hides the hashed password from API responses by default
    },
    phone: {
        type: String,
        trim: true,
        default: ''
    },
    avatar: {
        // Stored as a base64 data URI (e.g. "data:image/jpeg;base64,...").
        // Kept small (resized client-side) since it lives directly on the document.
        type: String,
        default: ''
    },
    // Shared by every one-time-code flow (password reset, email verification,
    // new-device login) -- a user is only ever in one of those flows at a
    // time, so one hash+expiry pair covers all of them instead of three.
    otpCodeHash: {
        // bcrypt hash of the current 6-digit code, never the plain code itself
        type: String,
        select: false,
        default: null
    },
    otpCodeExpires: {
        type: Date,
        select: false,
        default: null
    },
    otpLastSentAt: {
        // Drives the resend cooldown -- see backend/utils/otp.js
        type: Date,
        select: false,
        default: null
    },
    // Set while an email change is awaiting OTP confirmation (sent to this
    // address, not the current one, to prove the user actually owns it).
    // Cleared once confirmed (moved into `email`) or abandoned.
    pendingEmail: {
        type: String,
        select: false,
        default: null
    },
    // Defaults to true so existing accounts (created before this field
    // existed) aren't retroactively locked out -- new registrations set this
    // to false explicitly until the OTP flow confirms the address.
    emailVerified: {
        type: Boolean,
        default: true
    },
    // Browsers/devices that have already completed an OTP challenge for this
    // account. A login from a deviceId not in this list is treated as new
    // and re-challenged, same idea as "new device" alerts on other services.
    trustedDevices: {
        type: [
            {
                deviceId: { type: String, required: true },
                userAgent: { type: String, default: 'Unknown device' },
                addedAt: { type: Date, default: Date.now },
                lastSeenAt: { type: Date, default: Date.now }
            }
        ],
        default: []
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    accountType: {
        type: String,
        enum: ['personal', 'business', 'enterprise'],
        default: 'personal'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    addresses: {
        type: [
            {
                // Not marked `required` even though the route always sends
                // them -- addresses saved before this field existed lack it,
                // and Mongoose re-validates every item in the array on any
                // save(), so a `required` here would permanently block those
                // older accounts from ever adding another address.
                fullName: { type: String, default: '' },
                phone: { type: String, default: '' },
                street: { type: String, required: true },
                city: { type: String, required: true },
                state: { type: String, required: true },
                zipCode: { type: String, required: true },
                Country: { type: String, required: true }
            }
        ],
        validate: [val => val.length <= 4, 'Exceeds the limit of 4 addresses']
    },
    newsletter: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    toJSON: { virtuals: true }, // Ensure virtuals show up when sending data to frontend
    toObject: { virtuals: true }
});

// =============================================
// VIRTUALS (Helper fields not stored in DB)
// =============================================

// Get just the first name for the "Welcome, [Name]" header
userSchema.virtual('firstName').get(function() {
    return this.name ? this.name.split(' ')[0] : '';
});

// =============================================
// MIDDLEWARE (Hooks)
// =============================================

// Hash password before saving to database
userSchema.pre('save', async function(next) {
    // Only hash if the password was actually changed (or is new)
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// =============================================
// INSTANCE METHODS
// =============================================

// Compare entered password with hashed password in DB
userSchema.methods.comparePassword = async function(candidatePassword) {
    // Note: Since we set select:false on password, 
    // we must ensure the password was 'selected' in the query for this to work
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);