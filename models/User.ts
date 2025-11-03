import { Schema, models, model } from "mongoose";

const UserSchema = new Schema(
  {
    address: { type: String, required: true, unique: true, index: true },
    provider: { type: String },
    profile: { type: Object },
  },
  { timestamps: true }
);

export const User = models.User || model("User", UserSchema);