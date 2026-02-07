const mongoose = require('mongoose');
const { Schema } = mongoose;

const ChatSchema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
  },
  {
    timestamps: true,
  }
);

ChatSchema.index({ participants: 1 });

const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

module.exports = Chat;
module.exports.default = Chat;
