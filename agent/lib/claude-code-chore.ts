import { HarnessAgent } from "@ai-sdk/harness/agent";
import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { createVercelNetworkSandboxSession } from "@ai-sdk/sandbox-vercel";
import { getToken } from "@vercel/connect";

import { resolveChoreAuthMode } from "./auth-mode";
import { rustToolchainChore } from "./rust-toolchain-chore";

/** Vercel Connect connector UID (`vercel connect create github`). */
const GITHUB_CONNECTOR = "github/wack-coldsnap";
/** Every chore repository lives in this org. */
const GITHUB_ORG = "wack";
/** Port the Claude Code bridge binds inside the sandbox. */
const BRIDGE_PORT = 4000;
/** Directory, relative to the sandbox working directory, holding the checkout. */
const WORK_DIR = "repo";

/**
 * Installs the C and Rust toolchains the chore needs.
 *
 * This runs once per template, after the Claude Code adapter's own bootstrap
 * and before the snapshot is published, so every session inherits it. Bump
 * BOOTSTRAP_HASH whenever this script changes, or the cached snapshot is reused.
 */
/**
 * Pinned so the bootstrap stays reproducible and the cached snapshot stays
 * valid. Bump with BOOTSTRAP_HASH when upgrading.
 */
const CARGO_MAKE_VERSION = "0.37.24";
const BOOTSTRAP_HASH = "rust-toolchain-v3-prebuilt-cargo-make";
const INSTALL_RUST = `
set -euo pipefail

# Vercel Sandbox's node24 runtime is Amazon Linux, so dnf is the package
# manager. Detect rather than assume: the image is not contractual, and an
# apt-get-only script fails with "command not found" rather than anything
# that points at the real problem.
if command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y gcc gcc-c++ make pkgconf-pkg-config openssl-devel unzip
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y gcc gcc-c++ make pkgconfig openssl-devel unzip
elif command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  sudo -E apt-get update
  sudo -E apt-get install -y --no-install-recommends build-essential pkg-config libssl-dev unzip
else
  echo "no supported package manager (dnf, yum, apt-get) in this sandbox image" >&2
  exit 1
fi

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs -o /tmp/rustup-init.sh
sh /tmp/rustup-init.sh -y --no-modify-path --profile default --default-toolchain stable
rm -f /tmp/rustup-init.sh

export PATH="$HOME/.cargo/bin:$PATH"

# Prebuilt binary, not \`cargo install\`. Compiling cargo-make from source takes
# longer than Vercel's 800 second function limit, which killed the whole step
# before the snapshot could ever be captured, so every run repaid the cost and
# died in the same place.
CM_DIR="cargo-make-v${CARGO_MAKE_VERSION}-x86_64-unknown-linux-musl"
curl --proto '=https' --tlsv1.2 -sSfL \\
  "https://github.com/sagiegurari/cargo-make/releases/download/${CARGO_MAKE_VERSION}/\${CM_DIR}.zip" \\
  -o /tmp/cargo-make.zip
unzip -q -o /tmp/cargo-make.zip -d /tmp/cargo-make
find /tmp/cargo-make -type f -name 'cargo-make' -exec install -m 0755 {} "$HOME/.cargo/bin/cargo-make" \\;
find /tmp/cargo-make -type f -name 'makers' -exec install -m 0755 {} "$HOME/.cargo/bin/makers" \\;
rm -rf /tmp/cargo-make /tmp/cargo-make.zip
test -x "$HOME/.cargo/bin/cargo-make"

for bin in "$HOME"/.cargo/bin/*; do
  sudo ln -sf "$bin" /usr/local/bin/
done

sudo mkdir -p /etc/profile.d
printf 'export PATH="$HOME/.cargo/bin:$PATH"\\n' | sudo tee /etc/profile.d/rust.sh >/dev/null

rustc --version
cargo make --version
`;

/**
 * Builds the Claude Code harness for one chore run.
 *
 * Built per run rather than at module scope because it reads credentials from
 * the environment, and eve evaluates authored modules at build time where those
 * credentials are absent.
 *
 * Every difference between paying with Gateway credits and paying with the
 * Claude subscription lives behind `ChoreAuthMode`, selected by
 * `CHORE_AUTH_MODE`. Nothing here branches on which route is active.
 */
function createChoreAgent() {
  const authMode = resolveChoreAuthMode();

  return new HarnessAgent({
    harness: createClaudeCode({
      auth: authMode.auth,
      env: authMode.env,
      port: BRIDGE_PORT,
      effort: "high",
    }),
    model: authMode.model,
    instructions:
      "You are running unattended on a schedule. Nobody can answer a question, " +
      "so never ask one. The repository is already cloned into the current " +
      "working directory and `gh` is authenticated for it. Finishing with no " +
      "pull request is a correct outcome when there is nothing to change.",
    sandboxConfig: {
      workDir: WORK_DIR,
      bootstrapHash: BOOTSTRAP_HASH,
      onBootstrap: async ({ session, abortSignal }) => {
        const installed = await session.run({ command: INSTALL_RUST, abortSignal });
        if (installed.exitCode !== 0) {
          throw new Error(`Rust toolchain install failed:\n${installed.stderr}`);
        }
      },
    },
  });
}

/** Mints a GitHub App installation token scoped to exactly one repository. */
async function mintRepositoryToken(repository: string): Promise<string> {
  const [org, name] = repository.split("/");
  if (org !== GITHUB_ORG || !name) {
    throw new Error(
      `Repository ${repository} is outside the ${GITHUB_ORG} organization.`,
    );
  }
  return getToken(GITHUB_CONNECTOR, {
    subject: { type: "app" },
    authorizationDetails: [
      { type: "github_app_installation", org: GITHUB_ORG, repositories: [name] },
    ],
  });
}

/**
 * Runs the Rust toolchain chore for one repository through Claude Code.
 *
 * Creates a sandbox from the prepared snapshot, clones the repository with a
 * short-lived installation token, hands Claude Code the chore prompt, and tears
 * everything down. Each call is fully isolated: its own sandbox, its own clone,
 * its own harness session.
 */
export async function runRustToolchainChore(repository: string): Promise<string> {
  const choreAgent = createChoreAgent();
  const token = await mintRepositoryToken(repository);

  const sandboxSession = await createVercelNetworkSandboxSession({
    runtime: "node24",
    ports: [BRIDGE_PORT],
    timeout: 45 * 60 * 1000,
    resources: { vcpus: 4 },
    template: await choreAgent.getSandboxTemplate(),
  });

  try {
    const cloned = await sandboxSession.run({
      command: [
        "set -euo pipefail",
        // Keep the token out of the remote URL so it never lands in .git/config.
        `printf '%s\\n' "https://x-access-token:${token}@github.com" > "$HOME/.git-credentials"`,
        `chmod 600 "$HOME/.git-credentials"`,
        `git config --global credential.helper store`,
        `git config --global user.name "wack coldsnap"`,
        `git config --global user.email "coldsnap@wack.run"`,
        `rm -rf ${WORK_DIR}`,
        `git clone --depth 50 "https://github.com/${repository}.git" ${WORK_DIR}`,
      ].join("\n"),
      env: { GH_TOKEN: token },
    });
    if (cloned.exitCode !== 0) {
      throw new Error(`Cloning ${repository} failed:\n${cloned.stderr}`);
    }

    const session = await choreAgent.createSession({ sandboxSession });
    try {
      const result = await choreAgent.generate({
        session,
        prompt: rustToolchainChore(repository),
      });
      return result.text;
    } finally {
      await session.destroy();
    }
  } finally {
    await sandboxSession.destroy();
  }
}
