import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { getSettings } from "./models/Settings.js";
import { Template } from "./models/Template.js";
import { Section } from "./models/Section.js";
import { Lead } from "./models/Lead.js";
import { reclassifyAll } from "./services/reclassify.js";

const DEFAULT_TEMPLATE = {
    name: "Default cold pitch",
    subject: "Re: {{title}}",
    body: `Hi,

Saw your post ({{leadUrl}}) — this is squarely in my wheelhouse.

I'm {{myName}}, {{headline}}. I work with {{skills}}, and I've shipped production systems in exactly this stack.

A couple of relevant things I've built:
- {{portfolioUrl}}

Happy to do a quick free scoping call this week, or I can send a short written plan for how I'd approach it first — whichever is easier.

Rate: {{rate}}

Thanks,
{{myName}}`,
};

/**
 * First boot after the sections feature: promote the single global keyword list
 * into a real section and file every existing lead into it or Unsorted. Runs
 * once — the presence of any section means the migration already happened.
 */
async function migrateToSections() {
    if ((await Section.countDocuments()) > 0) return;

    const settings = await getSettings();
    const keywords = settings.keywords ?? [];
    if (keywords.length === 0) return;

    await Section.create({
        name: "Freelance / Dev",
        keywords,
        color: "#4f8ef7",
        order: 0,
    });
    console.log(`[leadforge] created "Freelance / Dev" from ${keywords.length} saved keywords`);

    if ((await Lead.countDocuments()) > 0) {
        const result = await reclassifyAll();
        console.log(
            `[leadforge] classified ${result.scanned} existing leads (${result.moved} filed into a section)`,
        );
    }
}

async function main() {
    await mongoose.connect(config.mongoUri);
    console.log(`[leadforge] connected to ${config.mongoUri}`);

    await getSettings(); // ensure settings doc exists
    await migrateToSections();
    if ((await Template.countDocuments()) === 0) {
        await Template.create(DEFAULT_TEMPLATE);
        console.log("[leadforge] seeded default pitch template");
    }

    const app = createApp();
    app.listen(config.port, () => {
        console.log(`[leadforge] API on http://localhost:${config.port}`);
    });
}

main().catch((err) => {
    console.error("[leadforge] fatal:", err);
    process.exit(1);
});
