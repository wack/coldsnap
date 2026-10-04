import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  // Mondays at 11:00 UTC, which is 07:00 US Eastern while EDT is in effect.
  // Vercel Cron evaluates the expression in UTC, so this shifts to 06:00 Eastern
  // during EST.
  cron: "0 11 * * 1",
  markdown:
    "Call the rust_toolchain_update tool with repository `wack/multitool`. " +
    "That tool owns the whole chore, so do not inspect the repository, plan, " +
    "or do any of the work yourself. When it returns, you are done.",
});
