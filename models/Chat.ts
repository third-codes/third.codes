import { Schema, models, model } from "mongoose";

const ChatSchema = new Schema(
  {
    address: { type: String, required: true, index: true, lowercase: true },
    contractId: { type: Schema.Types.ObjectId, ref: "Contract", index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    model: { type: String },
  },
  { timestamps: true }
);

export const Chat = models.Chat || model("Chat", ChatSchema);