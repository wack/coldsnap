// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteTenantDialog } from "@/components/coldsnap/delete-tenant-dialog";
import { PasswordField } from "@/components/coldsnap/password-field";
import { TooltipProvider } from "@/components/ui/tooltip";

// jsdom has no ResizeObserver; Radix tooltips measure their trigger with it.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const deleteTenantAction = vi.fn();
vi.mock("@/app/actions", () => ({
  deleteTenantAction: (...args: unknown[]) => deleteTenantAction(...args),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

beforeEach(() => {
  deleteTenantAction.mockReset();
});

/** userEvent.setup() installs a clipboard stub; read what the UI wrote to it. */
const readClipboard = () => navigator.clipboard.readText();
afterEach(cleanup);

describe("DeleteTenantDialog", () => {
  const tenant = { id: "t1", name: "Mark's Bakery", host: "marks-bakery.sites.frank.video" };

  it("keeps Delete disabled until the exact site name is typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DeleteTenantDialog tenant={tenant} open onOpenChange={() => {}} />);

    const confirm = screen.getByLabelText("Type the site name to confirm");
    const button = screen.getByRole("button", { name: "Delete site" });
    expect(button).toBeDisabled();

    await user.type(confirm, "marks bakery");
    expect(button).toBeDisabled();
    await user.clear(confirm);
    await user.type(confirm, "Mark's Bakery ");
    expect(button).toBeDisabled();
    await user.clear(confirm);
    await user.type(confirm, "Mark's Bakery");
    expect(button).toBeEnabled();
  });

  it("copies the name so Frank can paste it, then deletes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    deleteTenantAction.mockResolvedValue({ ok: true });
    renderWithProviders(<DeleteTenantDialog tenant={tenant} open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Copy site name" }));
    const copied = await readClipboard();
    expect(copied).toBe("Mark's Bakery");

    await user.click(screen.getByLabelText("Type the site name to confirm"));
    await user.paste(copied);
    await user.click(screen.getByRole("button", { name: "Delete site" }));

    await waitFor(() => expect(deleteTenantAction).toHaveBeenCalledWith("t1", "Mark's Bakery"));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("shows the server's error and stays open when delete fails", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    deleteTenantAction.mockResolvedValue({ ok: false, error: "Delete did not finish." });
    renderWithProviders(<DeleteTenantDialog tenant={tenant} open onOpenChange={onOpenChange} />);

    await user.type(screen.getByLabelText("Type the site name to confirm"), "Mark's Bakery");
    await user.click(screen.getByRole("button", { name: "Delete site" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Delete did not finish.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("PasswordField", () => {
  it("hides the password until revealed, and copies without revealing", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordField password="k7mp-x3qa-9fht-2wze" />);

    expect(screen.getByLabelText("Password hidden")).toHaveTextContent("••••-••••-••••-••••");
    expect(screen.queryByText("k7mp-x3qa-9fht-2wze")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Copy password" }));
    expect(await readClipboard()).toBe("k7mp-x3qa-9fht-2wze");
    expect(screen.queryByText("k7mp-x3qa-9fht-2wze")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByText("k7mp-x3qa-9fht-2wze")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.queryByText("k7mp-x3qa-9fht-2wze")).toBeNull();
  });
});
