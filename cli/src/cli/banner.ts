import { Command } from "commander";
import { showBanner } from "../utils/banner.js";

export const bannerCommand = new Command("banner")
  .description("Print the rainbow ASCII banner")
  .option("--plain", "no color (useful when piping to a file)")
  .option("--no-tagline", "skip the tagline + subtitle")
  .option("--indent <n>", "left-padding in spaces (default 2)", "2")
  .action((opts: { plain?: boolean; tagline?: boolean; indent: string }) => {
    showBanner({
      plain: opts.plain,
      noTagline: opts.tagline === false,
      indent: parseInt(opts.indent, 10) || 2,
    });
  });
