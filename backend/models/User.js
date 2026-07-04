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
                street: { type: String, required: true },
                city: { type: String, required: true },
                state: { type: String, required: true },
                zipCode: { type: String, required: true },
                Country: { type: String, required: true }
            }
        ],
        validate: [val => val.length <= 3, 'Exceeds the limit of 3 addresses']
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