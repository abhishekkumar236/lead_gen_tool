import express from "express";
import cors from "cors";
import { leadsRouter } from "./routes/leads.js";
import { scrapeRouter } from "./routes/scrape.js";
import { templatesRouter } from "./routes/templates.js";
import { settingsRouter } from "./routes/settings.js";
import { statsRouter } from "./routes/stats.js";
import { emailRouter } from "./routes/email.js";
import { sectionsRouter } from "./routes/sections.js";

export function createApp() {
    const app = express();
    app.use(cors());
    app.use(express.json({ limit: "1mb" }));

    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.use("/api/sections", sectionsRouter);
    app.use("/api/leads", leadsRouter);
    app.use("/api/scrape", scrapeRouter);
    app.use("/api/templates", templatesRouter);
    app.use("/api/settings", settingsRouter);
    app.use("/api/stats", statsRouter);
    app.use("/api/email", emailRouter);

    // Express 5 forwards rejected async handlers here automatically.
    app.use(
        (
            err: Error,
            _req: express.Request,
            res: express.Response,
            _next: express.NextFunction,
        ) => {
            console.error(err);
            res.status(500).json({ error: err.message });
        },
    );
    return app;
}
