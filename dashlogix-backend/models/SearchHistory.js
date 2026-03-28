import mongoose from "mongoose";

const searchHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    queryText: { type: String, required: true },
    splQuery: { type: String, required: true },
    mode: { type: String, default: "mongo-cache" },
    resultCount: { type: Number, default: 0 },
    filters: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("SearchHistory", searchHistorySchema);
