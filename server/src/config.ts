export const config = {
    port: Number(process.env.PORT ?? 4100),
    mongoUri: process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/leadforge",
    fetchTimeoutMs: Number(process.env.FETCH_TIMEOUT_MS ?? 15000),
};
