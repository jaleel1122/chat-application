const mongoose = require('mongoose');
const { Schema } = mongoose;

const MessageSchema = new Schema(
  {
    chat: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'voice', 'video', 'file'],
      default: 'text',
    },
    mediaUrl: {
      type: String,
    },
    translatedContent: {
      type: Map,
      of: String,
      default: {},
    },
    detectedLanguage: {
      type: String,
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ chat: 1, createdAt: -1 });

const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema);

module.exports = Message;
module.exports.default = Message;
