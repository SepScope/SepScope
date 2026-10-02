import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckCard } from "@/components/CheckCard";

describe("CheckCard", () => {
  it("shows a passing check with its latency and supported assets", () => {
    render(
      <CheckCard
        check={{ checkId: "sep24.info", status: "pass", latencyMs: 311, detail: { deposit: ["USDC", "native"], withdraw: [] } }}
      />,
    );
    const card = screen.getByRole("article", { name: "Interactive transfer /info" });
    expect(within(card).getByText("SEP-24 ·", { exact: false })).toBeInTheDocument();
    expect(within(card).getByText("Pass")).toBeInTheDocument();
    expect(within(card).getByText("311 ms")).toBeInTheDocument();
    expect(within(card).getByText("Deposit")).toHaveTextContent("Deposit (2)");
    expect(within(card).getByText("USDC")).toBeInTheDocument();
    expect(within(card).getByText("XLM").closest("li")).toHaveAttribute("title", "native");
    expect(within(card).getByText("Withdraw")).toHaveTextContent("Withdraw (0)");
    expect(within(card).getByText("None enabled")).toBeInTheDocument();
  });

  it("shows SEP-38 assets with issuer and fiat notes", () => {
    const issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    render(<CheckCard check={{ checkId: "sep38.info", status: "pass", detail: { assets: [`stellar:USDC:${issuer}`, "iso4217:USD"] } }} />);
    expect(screen.getByText("USDC").closest("li")).toHaveAttribute("title", `stellar:USDC:${issuer}`);
    expect(screen.getByText("GBBD…FLA5")).toBeInTheDocument();
    expect(screen.getByText("fiat")).toBeInTheDocument();
  });

  it("shows a failing check's readable error", () => {
    render(
      <CheckCard
        check={{ checkId: "sep1.cors", status: "fail", latencyMs: 142, error: "Missing Access-Control-Allow-Origin header" }}
      />,
    );
    expect(screen.getByText("Fail")).toBeInTheDocument();
    expect(screen.getByText("Missing Access-Control-Allow-Origin header")).toHaveClass("bg-fail-soft");
  });

  it("shows why a check was skipped, muted, and omits latency it never measured", () => {
    render(<CheckCard check={{ checkId: "sep6.info", status: "skipped", error: "TRANSFER_SERVER is not declared" }} />);
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("TRANSFER_SERVER is not declared")).toHaveClass("text-muted");
    expect(screen.queryByText("Latency")).not.toBeInTheDocument();
  });

  it("explains a check skipped because a prerequisite failed", () => {
    render(<CheckCard check={{ checkId: "sep1.parse", status: "skipped", detail: { blockedBy: ["sep1.reachable"] } }} />);
    expect(screen.getByText("Not run because stellar.toml reachable did not pass.")).toHaveClass("text-muted");
  });

  it("lists the endpoints sep1.fields found", () => {
    render(
      <CheckCard
        check={{ checkId: "sep1.fields", status: "pass", detail: { endpoints: { WEB_AUTH_ENDPOINT: "https://a.example/auth" } } }}
      />,
    );
    expect(screen.getByText("Declared endpoints")).toBeInTheDocument();
    expect(screen.getByText("WEB_AUTH_ENDPOINT")).toBeInTheDocument();
    expect(screen.getByText("https://a.example/auth")).toBeInTheDocument();
  });

  it("handles an unknown check and a warning", () => {
    render(<CheckCard check={{ checkId: "custom.check", status: "warn" }} />);
    expect(screen.getByRole("article", { name: "custom.check" })).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.queryByText("SEP-", { exact: false })).not.toBeInTheDocument();
  });
});
