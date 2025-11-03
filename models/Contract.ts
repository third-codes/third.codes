import mongoose, { Schema } from "mongoose";

const ContractSchema = new Schema(
  {
    // Owner wallet for this contract entry (creator)
    address: { type: String, required: true, index: true, lowercase: true },
    // Deployed details (if deployment has occurred)
    deployedAddress: { type: String, index: true, lowercase: true },
    deployedNetwork: { type: String },
    deployedOwner: { type: String, lowercase: true },
    // Exact compiled ABI (array of items)
    abi: { type: [Schema.Types.Mixed] },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    // single-file fallback
    code: { type: String },
    // multi-file support: array of { name, content }
    files: {
      type: [
        new Schema(
          {
            name: { type: String, required: true },
            content: { type: String, required: true },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    title: { type: String },
    model: { type: String },
  },
  { timestamps: true }
);

// Ensure latest schema is used during dev HMR
if (mongoose.models.Contract) {
  try {
    mongoose.deleteModel("Contract");
  } catch {}
}
export const Contract = mongoose.model("Contract", ContractSchema);