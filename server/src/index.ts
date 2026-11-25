import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { Template } from "./models/Template.js";
import { seedDefaultSections } from "./defaultSections.js";

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

async function main() {
    await mongoose.connect(config.mongoUri);
    console.log(`[leadforge] connected to ${config.mongoUri}`);

    await seedDefaultSections();
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
