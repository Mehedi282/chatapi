const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
    name: String,
    avatar: String,
    phone: String,
    email: String,
    password: String,
    languageCode: String,
    contacts: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
    blocked: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
    blockedFrom: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
    devices: [String],
    createdAt: { type: Date, default: new Date() },
});

UserSchema.methods.setPassword = function(password) {
    this.password = bcrypt.hashSync(password, 8);
};

UserSchema.methods.validatePassword = function(password) {
    return bcrypt.compareSync(password, this.password);
};

UserSchema.methods.generateJWT = function() {
    return jwt.sign({
            id: this._id,
        },
        "secret"
    );
};

UserSchema.methods.toAuthJSON = function() {
    return {
        _id: this._id,
        email: this.email,
        token: this.generateJWT()
    };
};

module.exports = mongoose.model('User', UserSchema);