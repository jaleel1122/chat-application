const mongoose = require('mongoose');
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,
    },
    avatar: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      default: 'Hey there! I am using WhatsApp',
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    preferredLanguage: {
      type: String,
      default: 'en',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;
module.exports.default = User;
