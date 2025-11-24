import { Schema, models, model } from "mongoose";

const NewsletterSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true },
    userSub: { type: String, index: true },
    source: { type: String },
  },
  { timestamps: true }
);

export const Newsletter = models.Newsletter || model("Newsletter", NewsletterSchema);