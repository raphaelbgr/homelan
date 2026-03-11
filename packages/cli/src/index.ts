#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "module";
import { connectCommand } from "./commands/connect.js";
import { disconnectCommand } from "./commands/disconnect.js";
import { statusCommand } from "./commands/status.js";

// Read version from package.json
const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const program = new Command();

program
  .name("homelan")
  .description("HomeLAN tunnel — access your home LAN from anywhere")
  .version(pkg.version);

program.addCommand(connectCommand());
program.addCommand(disconnectCommand());
program.addCommand(statusCommand());

await program.parseAsync(process.argv);
